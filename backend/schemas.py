"""
Pydantic v2 request / response schemas for the Solar Flare Early Warning API.

Every REST endpoint and the WebSocket telemetry stream use the models
defined here for serialisation and validation.  All schemas leverage
Pydantic v2 ``model_config`` and ``Field`` for strict typing and
auto-generated OpenAPI documentation.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# WebSocket / streaming telemetry
# ---------------------------------------------------------------------------


class TelemetryPoint(BaseModel):
    """A single real-time telemetry tick streamed over WebSocket.

    Attributes
    ----------
    timestamp : str
        ISO-8601 timestamp of the observation.
    sxr_value : float
        Current soft X-ray flux value (SoLEXS).
    hxr_value : float
        Current hard X-ray flux value (HEL1OS).
    sxr_rolling_mean : float
        Exponentially-weighted rolling mean of SXR values.
    hxr_rolling_mean : float
        Exponentially-weighted rolling mean of HXR values.
    """

    timestamp: str = Field(..., description="ISO-8601 timestamp")
    sxr_value: float = Field(..., description="Current SXR flux")
    hxr_value: float = Field(..., description="Current HXR flux")
    sxr_rolling_mean: float = Field(0.0, description="SXR rolling mean")
    hxr_rolling_mean: float = Field(0.0, description="HXR rolling mean")


# ---------------------------------------------------------------------------
# POST /clean  — Denoising Autoencoder
# ---------------------------------------------------------------------------


class CleanRequest(BaseModel):
    """Request body for the signal-cleaning endpoint.

    Attributes
    ----------
    raw_window : list[float]
        1-D array of raw counts to denoise (length = model window size).
    instrument : Literal['helios', 'solexs']
        Which instrument produced the signal.
    """

    raw_window: list[float] = Field(
        ..., min_length=1, description="Raw signal window to clean"
    )
    instrument: Literal["helios", "solexs"] = Field(
        ..., description="Source instrument identifier"
    )


class CleanResponse(BaseModel):
    """Response from the signal-cleaning endpoint.

    Attributes
    ----------
    cleaned_window : list[float]
        Denoised signal, same length as the input.
    anomaly_scores : list[float]
        Per-sample reconstruction-error anomaly scores.
    """

    cleaned_window: list[float] = Field(
        ..., description="Denoised signal window"
    )
    anomaly_scores: list[float] = Field(
        ..., description="Reconstruction-error anomaly scores"
    )


# ---------------------------------------------------------------------------
# POST /predict/nowcast  — CNN Nowcaster
# ---------------------------------------------------------------------------


class NowcastRequest(BaseModel):
    """Request body for the flare nowcasting endpoint.

    Attributes
    ----------
    hxr_window : list[list[float]]
        2-D feature array of shape ``[128, 4]``.
        Channels: ``[counts_clean, rolling_mean, rolling_std, derivative]``.
    """

    hxr_window: list[list[float]] = Field(
        ...,
        description=(
            "HXR feature window, shape [128, 4] — "
            "columns: counts_clean, rolling_mean, rolling_std, derivative"
        ),
    )


class NowcastResponse(BaseModel):
    """Response from the flare nowcasting endpoint.

    Attributes
    ----------
    flare_probability : float
        Estimated probability (0-1) that a flare is imminent.
    is_critical : bool
        ``True`` when ``flare_probability`` exceeds the alert threshold.
    confidence : float
        Model confidence in its prediction (0-1).
    """

    flare_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Flare probability [0, 1]"
    )
    is_critical: bool = Field(
        ..., description="Whether the probability exceeds the alert threshold"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Prediction confidence [0, 1]"
    )


# ---------------------------------------------------------------------------
# POST /predict/forecast  — BiLSTM Forecaster
# ---------------------------------------------------------------------------


class ForecastRequest(BaseModel):
    """Request body for the flare forecasting endpoint.

    Attributes
    ----------
    sxr_window : list[list[float]]
        2-D feature array of shape ``[512, 4]``.
        Channels: ``[counts_clean, rolling_mean, rolling_std, nowcast_prob]``.
    """

    sxr_window: list[list[float]] = Field(
        ...,
        description=(
            "SXR feature window, shape [512, 4] — "
            "columns: counts_clean, rolling_mean, rolling_std, nowcast_prob"
        ),
    )


class ForecastResponse(BaseModel):
    """Response from the flare forecasting endpoint.

    Attributes
    ----------
    predicted_class : str
        GOES flare class — one of B, C, M, X.
    class_probabilities : dict[str, float]
        Softmax probabilities for each class.
    time_to_peak_hours : float
        Estimated hours until the SXR flux peak.
    confidence : float
        Model confidence in the predicted class (0-1).
    """

    predicted_class: str = Field(
        ..., description="Predicted GOES flare class (B/C/M/X)"
    )
    class_probabilities: dict[str, float] = Field(
        ..., description="Per-class softmax probabilities"
    )
    time_to_peak_hours: float = Field(
        ..., ge=0.0, description="Estimated hours until SXR peak"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Classification confidence [0, 1]"
    )


# ---------------------------------------------------------------------------
# GET /health  — System status
# ---------------------------------------------------------------------------


class SystemStatus(BaseModel):
    """Health-check / system-status response.

    Attributes
    ----------
    models_loaded : dict[str, bool]
        Which ML models were successfully loaded from disk.
    device : str
        Torch compute device in use (``cpu`` / ``cuda``).
    uptime_seconds : float
        Seconds since the server started.
    """

    models_loaded: dict[str, bool] = Field(
        ..., description="Model name → loaded flag"
    )
    device: str = Field(..., description="Torch device (cpu / cuda)")
    uptime_seconds: float = Field(
        ..., ge=0.0, description="Server uptime in seconds"
    )
