# ML Pipeline

Training and prediction use the backend's scikit-learn services and actual uploaded or explicitly supplied records. Synthetic training is development-only and is identified as synthetic. Training requires sufficient labeled data and both target classes.

Delay labels use valid promised/actual delivery timestamps where available, otherwise explicit on-time/late status values. Undelivered rows without known outcomes are excluded. Known post-delivery and delay-derived columns are removed from prediction features. A chronological holdout is used when a usable shipment creation timestamp exists; otherwise a stratified holdout is used. Candidate models are compared using held-out F1. Metrics and global feature importance come from the selected fitted model; importance is not causal and no local per-shipment explanation is fabricated.

Production model monitoring, drift detection, calibration analysis, PR-AUC, cost-based thresholds, and ground-truth outcome monitoring are **NOT IMPLEMENTED**. Model artifacts use local disk and need durable versioned storage before production deployment.

