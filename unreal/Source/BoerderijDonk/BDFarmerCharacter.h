#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "BDFarmerCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UInputMappingContext;
class UInputAction;
struct FInputActionValue;

/**
 * Personnage joueur (le fermier). Équivalent Unreal de src/farmer.js :
 * déplacement + caméra chase. Le Skeletal Mesh (Farmer-v2) et l'Animation
 * Blueprint sont assignés dans un Blueprint enfant (BP_FarmerCharacter).
 * Les animations (idle/marche/course, récolte...) se gèrent dans l'Anim BP.
 */
UCLASS()
class BOERDERIJDONK_API ABDFarmerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ABDFarmerCharacter();

	/** Contexte d'entrées du fermier (lu par le véhicule pour basculer marche/conduite). */
	UInputMappingContext* GetMappingContext() const { return DefaultMappingContext; }

	/** Assoit / relève le personnage. bIsSeated pilote l'Anim BP (Chair_Sit_Idle_M). */
	void SetSeated(bool bSeated);

	/** Lu par l'Animation Blueprint pour choisir la pose assise. */
	UPROPERTY(BlueprintReadOnly, Category = "State")
	bool bIsSeated = false;

protected:
	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Bras de caméra (3e personne) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	USpringArmComponent* CameraBoom;

	/** Caméra qui suit */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	UCameraComponent* FollowCamera;

	/** Contexte d'entrées (à créer dans l'éditeur : IMC_Farmer) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputMappingContext* DefaultMappingContext;

	/** Action déplacement (IA_Move, Axis2D) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputAction* MoveAction;

	/** Action caméra (IA_Look, Axis2D) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputAction* LookAction;

	/** Action « monter / interagir » (IA_Interact, bouton). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Input")
	UInputAction* InteractAction;

	/** Portée pour monter dans un véhicule proche (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	float InteractRange = 350.f;

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);

	/** Cherche le véhicule le plus proche à portée et y monte. */
	void Interact();
};
