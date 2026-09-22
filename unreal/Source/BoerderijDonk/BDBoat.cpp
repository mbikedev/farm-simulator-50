#include "BDBoat.h"

ABDBoat::ABDBoat()
{
	MaxSpeed = 950.f;
	Acceleration = 500.f;
	TurnRate = 90.f;
	bIsBoat = true;
	WaterLevel = 0.f;   // à régler sur le Z de ta surface d'eau
}
