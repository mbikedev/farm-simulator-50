#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "BDVehicleBase.generated.h"

class USceneComponent;
class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UInputMappingContext;
class UInputAction;
struct FInputActionValue;
class ABDFarmerCharacter;

/**
 * Véhicule « arcade » (équivalent de la classe Vehicle de src/vehicles.js) :
 * accélération/freinage, direction dépendante de la vitesse, suivi du terrain
 * par raycast. Pas de physique Chaos (trop lourd sur mobile).
 *
 * Le mesh, le point d'assise (SeatPoint) et les réglages se règlent dans un
 * Blueprint enfant (BP_Tractor, BP_Boat, …). Monter/descendre gère la
 * possession et la pose assise du fermier.
 */
UCLASS()
class BOERDERIJDONK_API ABDVehicleBase : public APawn
{
	GENERATED_BODY()

public:
	ABDVehicleBase();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Fait monter un fermier : assoit, attache au siège, prend le contrôle. */
	void EnterVehicle(ABDFarmerCharacter* Driver);

	/** Fait descendre le fermier à côté du véhicule et lui rend le contrôle. */
	UFUNCTION(BlueprintCallable, Category = "Vehicle")
	void ExitVehicle();

protected:
	// ----- Composants -----
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Vehicle")
	USceneComponent* VehicleRoot;

	/** Carrosserie (assigne le mesh du véhicule dans le Blueprint enfant). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Vehicle")
	UStaticMeshComponent* Body;

	/** Emplacement du conducteur (positionne-le sur le siège dans le BP). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Vehicle")
	USceneComponent* SeatPoint;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	USpringArmComponent* CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	UCameraComponent* Camera;

	// ----- Réglages (surchargés par véhicule) -----
	/** Vitesse max en cm/s (Unreal = cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	float MaxSpeed = 900.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	float Acceleration = 800.f;

	/** Vitesse de rotation (deg/s) à pleine vitesse. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	float TurnRate = 110.f;

	/** Hauteur de la caisse au-dessus du sol (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	float GroundClearance = 0.f;

	/** Bateau : flotte à WaterLevel au lieu de suivre le terrain. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	bool bIsBoat = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle|Tuning")
	float WaterLevel = 0.f;

	// ----- Entrées (assets créés dans l'éditeur) -----
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputMappingContext* DriveMappingContext;

	/** IA_Drive (Axis2D : Y = gaz/frein, X = direction). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputAction* DriveAction;

	/** IA_Exit (bouton descendre). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputAction* ExitAction;

	// ----- État de conduite -----
	float CurrentSpeed = 0.f;
	float HeadingDeg = 0.f;
	float InputThrottle = 0.f;
	float InputSteer = 0.f;

	UPROPERTY()
	ABDFarmerCharacter* SeatedDriver = nullptr;

	void DriveInput(const FInputActionValue& Value);
	void DriveRelease(const FInputActionValue& Value);

	/** Place la caisse sur le sol (raycast) et l'oriente en lacet. */
	void FollowGround(FVector& InOutLocation) const;
};
