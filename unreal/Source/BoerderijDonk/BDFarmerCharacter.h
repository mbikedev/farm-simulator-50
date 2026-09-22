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

	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
};
