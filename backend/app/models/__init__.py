"""Import every model so Base.metadata (and Alembic autogenerate) sees all tables."""
from app.models.accident import AccidentRecord
from app.models.emergency import EmergencyRoute, EmergencyVehicle
from app.models.incident import Incident
from app.models.network import Intersection, Road
from app.models.signal import SignalOptimizationRun, TrafficSignal
from app.models.traffic import TrafficPrediction, TrafficRecord
from app.models.user import User

__all__ = [
    "AccidentRecord", "EmergencyRoute", "EmergencyVehicle", "Incident", "Intersection", "Road",
    "SignalOptimizationRun", "TrafficSignal", "TrafficPrediction", "TrafficRecord", "User",
]
