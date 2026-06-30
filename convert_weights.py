import tensorflow as tf
from backend.ml.models import build_nowcast_model, build_forecast_model, BinaryFocalLoss

custom_objects = {"BinaryFocalLoss": BinaryFocalLoss}

m1 = tf.keras.models.load_model("backend/saved_models/nowcast_1dcnn.h5", custom_objects=custom_objects)
m1.save_weights("backend/saved_models/nowcast_1dcnn.weights.h5")
print("Saved nowcast weights")

m2 = tf.keras.models.load_model("backend/saved_models/forecast_bilstm.h5", custom_objects=custom_objects)
m2.save_weights("backend/saved_models/forecast_bilstm.weights.h5")
print("Saved forecast weights")