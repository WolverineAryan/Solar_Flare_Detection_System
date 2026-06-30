"""
TensorFlow/Keras model definitions for SolarWatch.
Implements:
1. Nowcast1DCNN: Residual 1D-CNN nowcaster (input shape: [batch, 60, 4])
2. BiLSTMForecaster: 3-layer BiLSTM forecaster (input shape: [batch, 120, 5])
3. BinaryFocalLoss: Custom Keras Loss for class-imbalanced space weather targets
"""

from __future__ import annotations
import tensorflow as tf
from tensorflow.keras import Model
from tensorflow.keras.layers import (
    Input, Conv1D, BatchNormalization, ReLU, Add, MaxPool1D, Dropout, Flatten, Dense, Bidirectional, LSTM
)
from tensorflow.keras.losses import Loss

@tf.keras.utils.register_keras_serializable(package="custom")
class BinaryFocalLoss(Loss):
    """
    Keras implementation of Binary Focal Loss to target class imbalance.
    Formula: Loss = -alpha * target * (1-pred)^gamma * log(pred) - (1-alpha) * (1-target) * pred^gamma * log(1-pred)
    """
    def __init__(self, alpha: float = 0.20, gamma: float = 2.0, name: str = "binary_focal_loss", **kwargs):
        super().__init__(name=name, **kwargs)
        self.alpha = alpha
        self.gamma = gamma

    def call(self, y_true, y_pred):
        y_true = tf.cast(y_true, tf.float32)
        # Ensure y_true has the same shape as y_pred to prevent broadcasting bugs
        y_true = tf.reshape(y_true, tf.shape(y_pred))
        # Avoid log(0) or log(1) undefined states
        y_pred = tf.clip_by_value(y_pred, tf.keras.backend.epsilon(), 1.0 - tf.keras.backend.epsilon())
        
        # Calculate correct probability prediction factor
        pt = y_true * y_pred + (1.0 - y_true) * (1.0 - y_pred)
        
        # Apply alpha weighting
        focal_weight = self.alpha * y_true + (1.0 - self.alpha) * (1.0 - y_true)
        
        # Calculate standard binary cross entropy
        bce = -y_true * tf.math.log(y_pred) - (1.0 - y_true) * tf.math.log(1.0 - y_pred)
        
        loss = focal_weight * tf.math.pow(1.0 - pt, self.gamma) * bce
        return loss

    def get_config(self):
        config = super().get_config()
        config.update({
            "alpha": self.alpha,
            "gamma": self.gamma
        })
        return config

def build_nowcast_model(window_length: int = 60, in_channels: int = 4) -> Model:
    """
    Residual 1D-CNN Keras model for real-time solar flare nowcasting.
    Input shape: (batch_size, window_length, in_channels)
    """
    inputs = Input(shape=(window_length, in_channels))
    
    # Block 1
    x = Conv1D(filters=32, kernel_size=7, padding="same")(inputs)
    x = BatchNormalization()(x)
    x = ReLU()(x)
    
    # Residual branch
    res = Conv1D(filters=32, kernel_size=5, padding="same", use_bias=False)(x)
    res = BatchNormalization()(res)
    
    # Skip connection
    x = Add()([x, res])
    x = ReLU()(x)
    
    x = MaxPool1D(pool_size=2)(x)
    x = Dropout(0.2)(x)
    
    # Block 2
    x = Conv1D(filters=64, kernel_size=3, padding="same")(x)
    x = BatchNormalization()(x)
    x = ReLU()(x)
    
    x = MaxPool1D(pool_size=2)(x)
    x = Dropout(0.3)(x)
    
    # Dense classifier head
    x = Flatten()(x)
    x = Dense(64, activation="relu")(x)
    x = Dropout(0.4)(x)
    outputs = Dense(1, activation="sigmoid")(x)
    
    return Model(inputs=inputs, outputs=outputs, name="nowcast_1dcnn")

def build_forecast_model(window_length: int = 120, in_channels: int = 5) -> Model:
    """
    Stacked Bidirectional LSTM Keras model for 15-minute lead solar flare forecasting.
    Input shape: (batch_size, window_length, in_channels)
    """
    inputs = Input(shape=(window_length, in_channels))
    
    # Layer 1
    x = Bidirectional(LSTM(units=64, return_sequences=True, dropout=0.3))(inputs)
    x = BatchNormalization()(x)
    
    # Layer 2
    x = Bidirectional(LSTM(units=64, return_sequences=True, dropout=0.3))(x)
    x = BatchNormalization()(x)
    
    # Layer 3
    x = Bidirectional(LSTM(units=64, return_sequences=False, dropout=0.3))(x)
    x = BatchNormalization()(x)
    
    # Dense head
    x = Dense(64, activation="relu")(x)
    x = Dropout(0.4)(x)
    outputs = Dense(1, activation="sigmoid")(x)
    
    return Model(inputs=inputs, outputs=outputs, name="forecast_bilstm")
