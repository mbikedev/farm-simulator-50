#pragma once

#include "CoreMinimal.h"
#include "BDVehicleBase.h"
#include "BDBoat.generated.h"

/** Bateau : flotte à la surface de l'eau (bIsBoat). Règle WaterLevel = Z de ta zone d'eau. */
UCLASS()
class BOERDERIJDONK_API ABDBoat : public ABDVehicleBase
{
	GENERATED_BODY()

public:
	ABDBoat();
};
