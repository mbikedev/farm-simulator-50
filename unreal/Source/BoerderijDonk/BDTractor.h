#pragma once

#include "CoreMinimal.h"
#include "BDVehicleBase.h"
#include "BDTractor.generated.h"

/** Tracteur : rapide, tourne bien. Assigne tractor (Static Mesh) au Body dans BP_Tractor. */
UCLASS()
class BOERDERIJDONK_API ABDTractor : public ABDVehicleBase
{
	GENERATED_BODY()

public:
	ABDTractor();
};
