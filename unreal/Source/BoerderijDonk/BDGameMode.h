#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "BDGameMode.generated.h"

/** GameMode : équivalent de la mise en place de src/main.js (pion joueur par défaut). */
UCLASS()
class BOERDERIJDONK_API ABDGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ABDGameMode();
};
