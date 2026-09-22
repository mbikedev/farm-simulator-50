#include "BDGameMode.h"
#include "BDFarmerCharacter.h"

ABDGameMode::ABDGameMode()
{
	// Pion joueur par défaut = le fermier C++.
	// En pratique on assignera le Blueprint enfant BP_FarmerCharacter
	// (qui porte le Skeletal Mesh + l'Anim BP) dans les World Settings ou ici.
	DefaultPawnClass = ABDFarmerCharacter::StaticClass();
}
