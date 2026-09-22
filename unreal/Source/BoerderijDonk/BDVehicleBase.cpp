#include "BDVehicleBase.h"
#include "BDFarmerCharacter.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"

ABDVehicleBase::ABDVehicleBase()
{
	PrimaryActorTick.bCanEverTick = true;

	VehicleRoot = CreateDefaultSubobject<USceneComponent>(TEXT("VehicleRoot"));
	SetRootComponent(VehicleRoot);

	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(VehicleRoot);
	Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Body->SetCollisionResponseToAllChannels(ECR_Ignore);

	SeatPoint = CreateDefaultSubobject<USceneComponent>(TEXT("SeatPoint"));
	SeatPoint->SetupAttachment(VehicleRoot);
	SeatPoint->SetRelativeLocation(FVector(0.f, 30.f, 120.f)); // à ajuster par véhicule

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(VehicleRoot);
	CameraBoom->TargetArmLength = 750.f;
	CameraBoom->SocketOffset = FVector(0.f, 0.f, 200.f);
	CameraBoom->bUsePawnControlRotation = false;   // caméra fixe derrière le véhicule
	CameraBoom->bInheritPitch = false;
	CameraBoom->bInheritRoll = false;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 5.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
}

void ABDVehicleBase::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (DriveAction)
		{
			EIC->BindAction(DriveAction, ETriggerEvent::Triggered, this, &ABDVehicleBase::DriveInput);
			EIC->BindAction(DriveAction, ETriggerEvent::Completed, this, &ABDVehicleBase::DriveRelease);
		}
		if (ExitAction)
		{
			EIC->BindAction(ExitAction, ETriggerEvent::Started, this, &ABDVehicleBase::ExitVehicle);
		}
	}
}

void ABDVehicleBase::DriveInput(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	InputThrottle = Axis.Y;
	InputSteer = Axis.X;
}

void ABDVehicleBase::DriveRelease(const FInputActionValue& /*Value*/)
{
	InputThrottle = 0.f;
	InputSteer = 0.f;
}

void ABDVehicleBase::Tick(float Dt)
{
	Super::Tick(Dt);

	// --- Accélération / freinage (repris de Vehicle.drive) ---
	if (InputThrottle > 0.05f)
	{
		CurrentSpeed = FMath::Min(MaxSpeed, CurrentSpeed + Acceleration * InputThrottle * Dt);
	}
	else if (InputThrottle < -0.05f)
	{
		CurrentSpeed = FMath::Max(-MaxSpeed * 0.5f, CurrentSpeed + Acceleration * InputThrottle * Dt);
	}
	else
	{
		CurrentSpeed = FMath::FInterpTo(CurrentSpeed, 0.f, Dt, 3.f);
		if (FMath::Abs(CurrentSpeed) < 1.f) { CurrentSpeed = 0.f; }
	}

	// --- Direction : d'autant plus vive que le véhicule roule ---
	const float SteerFactor = FMath::Clamp(CurrentSpeed / (MaxSpeed * 0.35f), -1.f, 1.f);
	HeadingDeg -= InputSteer * TurnRate * SteerFactor * Dt;

	// --- Avance selon le cap ---
	const FRotator YawRot(0.f, HeadingDeg, 0.f);
	const FVector Forward = YawRot.Vector();
	FVector NewLoc = GetActorLocation() + Forward * CurrentSpeed * Dt;

	FollowGround(NewLoc);
	SetActorLocationAndRotation(NewLoc, YawRot, /*bSweep=*/false);
}

void ABDVehicleBase::FollowGround(FVector& InOutLocation) const
{
	if (bIsBoat)
	{
		InOutLocation.Z = WaterLevel;
		return;
	}

	FHitResult Hit;
	const FVector Start = InOutLocation + FVector(0.f, 0.f, 300.f);
	const FVector End = InOutLocation - FVector(0.f, 0.f, 1000.f);
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);
	if (SeatedDriver) { Params.AddIgnoredActor(SeatedDriver); }

	if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		InOutLocation.Z = Hit.ImpactPoint.Z + GroundClearance;
	}
}

void ABDVehicleBase::EnterVehicle(ABDFarmerCharacter* Driver)
{
	if (!Driver || SeatedDriver) { return; }
	APlayerController* PC = Cast<APlayerController>(Driver->GetController());
	if (!PC) { return; }

	SeatedDriver = Driver;

	// Le fermier s'assoit et s'attache au siège.
	Driver->SetSeated(true);
	Driver->AttachToComponent(SeatPoint, FAttachmentTransformRules::SnapToTargetIncludingScale);

	// Bascule des contextes d'entrée : fermier -> conduite.
	if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
		ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
	{
		if (UInputMappingContext* FarmerCtx = Driver->GetMappingContext())
		{
			Subsystem->RemoveMappingContext(FarmerCtx);
		}
		if (DriveMappingContext)
		{
			Subsystem->AddMappingContext(DriveMappingContext, 0);
		}
	}

	PC->Possess(this);
}

void ABDVehicleBase::ExitVehicle()
{
	if (!SeatedDriver) { return; }
	ABDFarmerCharacter* Driver = SeatedDriver;
	APlayerController* PC = Cast<APlayerController>(GetController());

	// Point de descente : à gauche du véhicule, posé au sol.
	const FVector Side = GetActorRightVector();
	FVector DropLoc = GetActorLocation() - Side * 200.f + FVector(0.f, 0.f, 50.f);
	FollowGround(DropLoc);
	DropLoc.Z += 90.f; // demi-hauteur de la capsule ~

	Driver->DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
	Driver->SetActorLocation(DropLoc, false);
	Driver->SetActorRotation(FRotator(0.f, HeadingDeg, 0.f));
	Driver->SetSeated(false);

	if (PC)
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
			ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (DriveMappingContext) { Subsystem->RemoveMappingContext(DriveMappingContext); }
			if (UInputMappingContext* FarmerCtx = Driver->GetMappingContext())
			{
				Subsystem->AddMappingContext(FarmerCtx, 0);
			}
		}
		PC->Possess(Driver);
	}

	InputThrottle = InputSteer = 0.f;
	CurrentSpeed = 0.f;
	SeatedDriver = nullptr;
}
