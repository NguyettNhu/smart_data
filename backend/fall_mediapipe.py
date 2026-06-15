"""
fall_mediapipe.py — Trained fall-detection inference (MediaPipe + TCN).

Logic adapted from doan-hoang-215/Fall-Detecton: the 38-D pose feature
extractor, the rule-based ensemble, Bayesian smoothing, scene awareness and
post-fall stillness. Only the INFERENCE pieces are included here (no training,
Telegram, recorder, etc.). The trained model + MediaPipe task file live in
backend/model_v8/.
"""
import numpy as np

N_FEATURES = 38

# MediaPipe Pose landmark indices
LM = {
    "nose": 0, "l_ear": 7, "r_ear": 8,
    "l_shoulder": 11, "r_shoulder": 12,
    "l_elbow": 13, "r_elbow": 14,
    "l_wrist": 15, "r_wrist": 16,
    "l_hip": 23, "r_hip": 24,
    "l_knee": 25, "r_knee": 26,
    "l_ankle": 27, "r_ankle": 28,
}
KEY_VIS = [0, 11, 12, 23, 24, 25, 26, 27, 28]

# Inference-relevant config (subset of the reference CONFIG)
CONFIG = {
    "jerk_scale": 30,
    "sequence_length": 60,
    "confidence_threshold": 0.60,
    "confirm_frames": 2,
    "accum_threshold": 0.68,
    "ensemble_weights": [0.72, 0.28],
    "bayes_alpha": 0.35,
    "bayes_rise_alpha": 0.60,
    "stillness_window": 45,
    "stillness_threshold": 0.04,
    "stillness_min_frames": 10,
    "scene_aware_threshold": True,
    "scene_topdown_boost": 0.08,
    "scene_lowlight_reduce": 0.05,
    "min_visibility": 0.20,
}


# ======================================================================
# extract_features (38-D pose features)
# ======================================================================
def extract_features(landmark_pair, prev_state, feat_history=None):
    """
    landmark_pair: (lm2d, lm_world) từ MediaPipe
    prev_state: dict chứa giá trị frame trước
    feat_history: list các feature vector gần đây (tối đa 30)
    Trả về: (feature_vector[38], new_state)
    """
    lm2d, lm_world = landmark_pair if isinstance(landmark_pair, tuple) else (landmark_pair, None)

    def pt2(idx):
        p = lm2d[idx]
        return np.array([p.x, p.y], dtype=np.float32)

    def vis(idx):
        return float(lm2d[idx].visibility or 0)

    def pt3(idx):
        if lm_world is None:
            return np.zeros(3, dtype=np.float32)
        p = lm_world[idx]
        return np.array([p.x, p.y, p.z], dtype=np.float32)

    # ── Landmark 2D ──────────────────────────────────────────────────
    nose      = pt2(LM["nose"])
    l_sh      = pt2(LM["l_shoulder"]); r_sh  = pt2(LM["r_shoulder"])
    l_hip     = pt2(LM["l_hip"]);      r_hip = pt2(LM["r_hip"])
    l_kn      = pt2(LM["l_knee"]);     r_kn  = pt2(LM["r_knee"])
    l_an      = pt2(LM["l_ankle"]);    r_an  = pt2(LM["r_ankle"])
    l_wr      = pt2(LM["l_wrist"]);    r_wr  = pt2(LM["r_wrist"])
    l_el      = pt2(LM["l_elbow"]);    r_el  = pt2(LM["r_elbow"])

    mid_sh    = (l_sh + r_sh)   / 2
    mid_hip   = (l_hip + r_hip) / 2
    mid_kn    = (l_kn + r_kn)   / 2
    mid_an    = (l_an + r_an)   / 2

    # ── Landmark 3D ──────────────────────────────────────────────────
    sh3_l  = pt3(LM["l_shoulder"]); sh3_r  = pt3(LM["r_shoulder"])
    hip3_l = pt3(LM["l_hip"]);      hip3_r = pt3(LM["r_hip"])
    kn3_l  = pt3(LM["l_knee"]);     kn3_r  = pt3(LM["r_knee"])
    nose3  = pt3(LM["nose"])

    mid_sh3  = (sh3_l + sh3_r)   / 2
    mid_hip3 = (hip3_l + hip3_r) / 2

    # ── Spine vector ──────────────────────────────────────────────────
    spine_vec   = mid_hip - mid_sh
    spine_len   = float(np.linalg.norm(spine_vec)) + 1e-6
    spine_angle = float(abs(spine_vec[0]) / spine_len)   # 0=thẳng đứng, 1=nằm ngang
    spine_horiz = float(abs(spine_vec[0]) / (abs(spine_vec[1]) + 1e-6))
    spine_horiz = float(np.clip(spine_horiz / 3.0, 0, 1))

    # ── Tilt ──────────────────────────────────────────────────────────
    sh_tilt   = float(abs(l_sh[1]  - r_sh[1]))
    hip_tilt  = float(abs(l_hip[1] - r_hip[1]))

    # ── Bounding box ──────────────────────────────────────────────────
    all_pts  = np.stack([nose, l_sh, r_sh, l_hip, r_hip,
                         l_kn, r_kn, l_an, r_an])
    xmin, ymin = all_pts.min(0)
    xmax, ymax = all_pts.max(0)
    bx_w = float(xmax - xmin) + 1e-6
    bx_h = float(ymax - ymin) + 1e-6
    bbox_ar     = float(np.clip(bx_w / bx_h, 0, 5))
    body_h_norm = float(np.clip(bx_h / bx_w, 0, 5))

    # ── Relative distances (normalized bằng spine 3D) ─────────────────
    spine3_vec = mid_hip3 - mid_sh3
    spine3_len = float(np.linalg.norm(spine3_vec)) + 1e-6
    norm_f     = spine3_len * 2.0

    head_hip_dy  = float(abs(nose[1]   - mid_hip[1]) / (bx_h + 1e-6))
    sh_hip_dy    = float(abs(mid_sh[1] - mid_hip[1]) / (bx_h + 1e-6))
    hip_knee_dy  = float(abs(mid_hip[1]- mid_kn[1])  / (bx_h + 1e-6))

    # ── Knee angles ───────────────────────────────────────────────────
    def _knee_angle(hip, knee, ankle):
        v1 = hip - knee; v2 = ankle - knee
        n1 = np.linalg.norm(v1); n2 = np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6: return 0.5
        cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        return float(np.clip(np.arccos(cos_a) / np.pi, 0, 1))

    knee_l   = _knee_angle(l_hip, l_kn, l_an)
    knee_r   = _knee_angle(r_hip, r_kn, r_an)
    knee_avg = (knee_l + knee_r) / 2.0

    # ── Visibility ────────────────────────────────────────────────────
    all_vis      = [vis(i) for i in range(33)]
    mean_vis     = float(np.mean(all_vis))
    min_core_vis = float(min(vis(i) for i in KEY_VIS))

    # ── 3D features ───────────────────────────────────────────────────
    if lm_world is not None:
        sh_z_diff      = float(abs(sh3_l[2]  - sh3_r[2]))
        hip_z_diff     = float(abs(hip3_l[2] - hip3_r[2]))
        spine_depth_tilt = float(np.clip((sh_z_diff + hip_z_diff) / 2.0, 0, 1))

        Y_axis = np.array([0, 1, 0], dtype=np.float32)
        sp3    = spine3_vec / (spine3_len + 1e-6)
        cos_sp = float(np.clip(np.dot(sp3, Y_axis), -1, 1))
        spine_angle_3d = float(np.clip(1.0 - abs(cos_sp), 0, 1))

        trunk3_vec = mid_sh3 - mid_hip3
        trunk3_len = float(np.linalg.norm(trunk3_vec)) + 1e-6
        t3n = trunk3_vec / trunk3_len
        trunk_angle_3d = float(np.clip(abs(t3n[2]), 0, 1))
    else:
        spine_depth_tilt = 0.0
        spine_angle_3d   = 0.0
        trunk_angle_3d   = 0.0

    # ── Near-camera score ──────────────────────────────────────────────
    body_frac        = float(bx_w * bx_h)
    near_camera_score= float(np.clip((body_frac - 0.15) / 0.35, 0, 1))

    # ── State-based velocity / acceleration ───────────────────────────
    cur_hip_y  = float(mid_hip[1])
    cur_nose_y = float(nose[1])
    cur_hip_z  = float(mid_hip3[2]) if lm_world else 0.0
    cur_nose_3 = nose3.copy()
    cur_mid_hip3 = mid_hip3.copy()

    if prev_state is None:
        v_hip_y = v_nose_y = a_hip_y = a_nose_y = j_hip_y = 0.0
        v_hip_z = a_hip_z = 0.0
        v_nose_3 = np.zeros(3)
        v_hip_3  = np.zeros(3)
        a_hip_3  = np.zeros(3)
    else:
        v_hip_y  = cur_hip_y  - prev_state["hip_y"]
        v_nose_y = cur_nose_y - prev_state["nose_y"]
        v_hip_z  = cur_hip_z  - prev_state["hip_z"]

        pv_hip  = prev_state.get("v_hip_y",  0.0)
        pv_nose = prev_state.get("v_nose_y", 0.0)
        pv_hip_z= prev_state.get("v_hip_z",  0.0)
        a_hip_y  = v_hip_y  - pv_hip
        a_nose_y = v_nose_y - pv_nose
        a_hip_z  = v_hip_z  - pv_hip_z

        pa_hip  = prev_state.get("a_hip_y",  0.0)
        j_hip_y = a_hip_y - pa_hip

        v_nose_3 = cur_nose_3  - prev_state.get("nose_3", cur_nose_3)
        v_hip_3  = cur_mid_hip3 - prev_state.get("hip_3", cur_mid_hip3)
        pa_hip_3 = prev_state.get("a_hip_3", np.zeros(3))
        a_hip_3  = v_hip_3  - prev_state.get("v_hip_3", np.zeros(3))

    js  = CONFIG.get("jerk_scale", 30)

    # Cập nhật state
    cur = {
        "hip_y":   cur_hip_y,  "nose_y": cur_nose_y,
        "hip_z":   cur_hip_z,
        "v_hip_y": v_hip_y,    "v_nose_y": v_nose_y,
        "v_hip_z": v_hip_z,
        "a_hip_y": a_hip_y,    "a_nose_y": a_nose_y,
        "a_hip_z": a_hip_z,
        "nose_3":  cur_nose_3, "hip_3": cur_mid_hip3,
        "v_nose_3":v_nose_3,   "v_hip_3": v_hip_3,
        "a_hip_3": a_hip_3 if prev_state else np.zeros(3),
    }

    # ── Window statistics (features [25-27]) ──────────────────────────
    if feat_history and len(feat_history) >= 5:
        hist_arr      = np.array(feat_history[-30:], dtype=np.float32)
        hist_v_hip    = hist_arr[:, 12]
        hist_spine    = hist_arr[:, 1]

        max_v_hip_15f = float(np.max(hist_arr[-15:, 12])) if len(hist_arr) >= 15 \
                        else float(np.max(hist_v_hip))
        max_v_hip_15f = float(np.clip(max_v_hip_15f, 0, 1))

        std_spine_15f = float(np.std(hist_arr[-15:, 1])) if len(hist_arr) >= 15 \
                        else float(np.std(hist_spine))
        std_spine_15f = float(np.clip(std_spine_15f * 5, 0, 1))

        n_descending  = float(np.sum(hist_v_hip > 0.015))
        descent_ratio = float(np.clip(n_descending / max(len(hist_v_hip), 1), 0, 1))
    else:
        max_v_hip_15f = std_spine_15f = descent_ratio = 0.0

    # ── NEW features [28-37] ──────────────────────────────────────────
    # [28] hip_accel_mag: 3D acceleration magnitude
    if prev_state is not None:
        a_hip_3_cur = cur.get("a_hip_3", np.zeros(3))
        hip_accel_mag = float(np.clip(np.linalg.norm(a_hip_3_cur) * 20, 0, 1))
    else:
        hip_accel_mag = 0.0

    # [29] asymmetry_score: bất đối xứng chuyển động trái/phải
    # Dùng sự khác biệt vị trí Y của l_hip và r_hip thay đổi theo thời gian
    if feat_history and len(feat_history) >= 3:
        # Ước lượng từ sh_tilt + hip_tilt biến động trong 10f
        tilt_arr = np.array([f[2] for f in feat_history[-10:]], dtype=np.float32)  # sh_tilt
        asymmetry_score = float(np.clip(np.std(tilt_arr) * 8 + (sh_tilt + hip_tilt) / 2, 0, 1))
    else:
        asymmetry_score = float(np.clip((sh_tilt + hip_tilt) / 2, 0, 1))

    # [30] pose_energy: tổng kinetic energy của tất cả joints
    if feat_history and len(feat_history) >= 5:
        # Sử dụng velocity fields (idx 12,13) + 3D (idx 22,23) như proxy
        energy_arr = np.array(feat_history[-20:], dtype=np.float32)
        v_cols = [12, 13, 14, 15, 16, 22, 23]  # velocity và acceleration fields
        valid_cols = [c for c in v_cols if c < energy_arr.shape[1]]
        pose_energy = float(np.clip(np.mean(energy_arr[:, valid_cols] ** 2) * 10, 0, 1))
    else:
        pose_energy = 0.0

    # [31] fall_impulse: tích phân |v * a| trong 5 frame = dấu hiệu va chạm đột ngột
    if feat_history and len(feat_history) >= 5:
        imp_arr = np.array(feat_history[-5:], dtype=np.float32)
        v5 = imp_arr[:, 12]  # v_hip_y
        a5 = imp_arr[:, 14]  # a_hip_y
        fall_impulse = float(np.clip(np.sum(np.abs(v5 * a5)) * 15, 0, 1))
    else:
        fall_impulse = 0.0

    # [32] lateral_tilt_rate: tốc độ thay đổi sh_tilt (ngã sang bên: rate cao)
    if feat_history and len(feat_history) >= 3:
        tilt_last3 = [f[2] for f in feat_history[-3:]]
        lateral_tilt_rate = float(np.clip(abs(tilt_last3[-1] - tilt_last3[0]) * 5, 0, 1))
    else:
        lateral_tilt_rate = 0.0

    # [33] knee_extension_rate: tốc độ duỗi gối (ngã: gối duỗi đột ngột)
    if feat_history and len(feat_history) >= 5:
        kn_arr   = np.array([f[11] for f in feat_history[-5:]], dtype=np.float32)  # knee_avg
        kn_early = float(np.mean(kn_arr[:2]))
        kn_late  = float(np.mean(kn_arr[-2:]))
        # duỗi = tăng; gập = giảm → ngã: duỗi đột ngột
        knee_extension_rate = float(np.clip((kn_late - kn_early) * 4, 0, 1))
    else:
        knee_extension_rate = 0.0

    # [34] arm_flail: biên độ vung tay (mất thăng bằng trước khi ngã)
    # Khoảng cách cổ tay so với thân người (mid_sh)
    l_wr_dist = float(np.linalg.norm(l_wr - mid_sh))
    r_wr_dist = float(np.linalg.norm(r_wr - mid_sh))
    arm_flail = float(np.clip((l_wr_dist + r_wr_dist) / 2.0 / (bx_h + 1e-6), 0, 1))

    # [35] head_accel_mag: gia tốc đầu 3D (ngã đầu xuống: spike đặc trưng)
    if prev_state is not None:
        v_nose_3_cur = cur.get("v_nose_3", np.zeros(3))
        pv_nose_3    = prev_state.get("v_nose_3", np.zeros(3))
        a_nose_3_mag = float(np.linalg.norm(v_nose_3_cur - pv_nose_3))
        head_accel_mag = float(np.clip(a_nose_3_mag * 15, 0, 1))
    else:
        head_accel_mag = 0.0

    # [36] body_sway: dao động ngang của hip trong 30f (ngã do chóng mặt)
    if feat_history and len(feat_history) >= 10:
        # Sử dụng v_hip_x proxy: biến động của spine_horiz trong 30f
        sway_arr = np.array([f[1] for f in feat_history[-30:]], dtype=np.float32)  # spine_horiz
        body_sway = float(np.clip(np.std(sway_arr) * 6, 0, 1))
    else:
        body_sway = 0.0

    # [37] impact_score: jerk peak sau velocity peak (va chạm sàn)
    if feat_history and len(feat_history) >= 10:
        vhip_10 = np.array([f[12] for f in feat_history[-10:]], dtype=np.float32)
        jhip_10 = np.array([f[16] for f in feat_history[-10:]], dtype=np.float32)
        v_peak_idx = int(np.argmax(vhip_10))
        # Impact = jerk cao SAU khi velocity peak (va chạm với mặt đất)
        if v_peak_idx < len(jhip_10) - 1:
            post_jerk = float(np.max(np.abs(jhip_10[v_peak_idx:])))
        else:
            post_jerk = 0.0
        impact_score = float(np.clip(post_jerk * 2, 0, 1))
    else:
        impact_score = 0.0

    feats = np.array([
        # ── 2D (19) ───────────────────────────────────────────────────
        spine_angle,          # [0]
        spine_horiz,          # [1]
        sh_tilt,              # [2]
        hip_tilt,             # [3]
        bbox_ar,              # [4]
        body_h_norm,          # [5]
        head_hip_dy,          # [6]
        sh_hip_dy,            # [7]
        hip_knee_dy,          # [8]
        knee_l, knee_r, knee_avg,  # [9,10,11]
        np.clip(v_hip_y  * 10, -1, 1),   # [12]
        np.clip(v_nose_y * 10, -1, 1),   # [13]
        np.clip(a_hip_y  * 20, -1, 1),   # [14]
        np.clip(a_nose_y * 20, -1, 1),   # [15]
        np.clip(j_hip_y  * js, -1, 1),   # [16]
        mean_vis, min_core_vis,           # [17,18]
        # ── 3D (5) ────────────────────────────────────────────────────
        spine_depth_tilt,     # [19]
        spine_angle_3d,       # [20]
        trunk_angle_3d,       # [21]
        np.clip(v_hip_z * 30, -1, 1),    # [22]
        np.clip(a_hip_z * 50, -1, 1),    # [23]
        # ── Guards & window stats (4) ──────────────────────────────────
        near_camera_score,    # [24]
        max_v_hip_15f,        # [25]
        std_spine_15f,        # [26]
        descent_ratio,        # [27]
        # ── NEW features v8 (10) ──────────────────────────────────────
        hip_accel_mag,        # [28]
        asymmetry_score,      # [29]
        pose_energy,          # [30]
        fall_impulse,         # [31]
        lateral_tilt_rate,    # [32]
        knee_extension_rate,  # [33]
        arm_flail,            # [34]
        head_accel_mag,       # [35]
        body_sway,            # [36]
        impact_score,         # [37]
    ], dtype=np.float32)

    assert len(feats) == N_FEATURES, f"Feature mismatch: {len(feats)} vs {N_FEATURES}"
    return feats, cur


# ======================================================================
# rule_based_score (10 negative gates + 14 positive rules)
# ======================================================================
def rule_based_score(buf_feats: list) -> float:
    if len(buf_feats) < 10:
        return 0.0

    n_buf   = len(buf_feats)
    buf_arr = np.array(buf_feats, dtype=np.float32)
    recent  = buf_arr[-15:]
    cur     = buf_feats[-1]

    # ── Feature indices ───────────────────────────────────────────────
    I_SPINE_HORIZ  = 1
    I_SH_TILT      = 2
    I_HIP_TILT     = 3
    I_BBOX_AR      = 4
    I_HEAD_HIP_DY  = 6
    I_SH_HIP_DY    = 7
    I_KNEE_AVG     = 11
    I_V_HIP_Y      = 12
    I_V_NOSE_Y     = 13
    I_A_HIP_Y      = 14
    I_A_NOSE_Y     = 15
    I_J_HIP_Y      = 16
    I_SPINE_DTILT  = 19
    I_SPINE_A3D    = 20
    I_TRUNK_A3D    = 21
    I_V_HIP_Z      = 22
    I_NEAR_CAM     = 24
    I_HIP_ACCEL    = 28
    I_ASYMMETRY    = 29
    I_POSE_ENERGY  = 30
    I_FALL_IMPULSE = 31
    I_LAT_TILT_RT  = 32
    I_KN_EXT_RT    = 33
    I_ARM_FLAIL    = 34
    I_HEAD_ACCEL   = 35
    I_BODY_SWAY    = 36
    I_IMPACT       = 37

    # ── Scalars ───────────────────────────────────────────────────────
    bbox_ar       = float(cur[I_BBOX_AR])
    spine_horiz   = float(cur[I_SPINE_HORIZ])
    knee_avg      = float(cur[I_KNEE_AVG])
    head_hip_dy   = float(cur[I_HEAD_HIP_DY])
    v_nose        = float(cur[I_V_NOSE_Y])
    a_nose        = float(cur[I_A_NOSE_Y])
    j_hip         = float(cur[I_J_HIP_Y])
    sh_tilt       = float(cur[I_SH_TILT])
    hip_tilt      = float(cur[I_HIP_TILT])
    spine_dtilt   = float(cur[I_SPINE_DTILT])
    spine_a3d     = float(cur[I_SPINE_A3D])
    trunk_a3d     = float(cur[I_TRUNK_A3D])
    v_hip_z       = float(cur[I_V_HIP_Z])
    near_cam      = float(cur[I_NEAR_CAM])
    hip_accel     = float(cur[I_HIP_ACCEL])   if len(cur) > I_HIP_ACCEL  else 0.0
    asymmetry     = float(cur[I_ASYMMETRY])   if len(cur) > I_ASYMMETRY  else 0.0
    pose_energy   = float(cur[I_POSE_ENERGY]) if len(cur) > I_POSE_ENERGY else 0.0
    fall_impulse  = float(cur[I_FALL_IMPULSE])if len(cur) > I_FALL_IMPULSE else 0.0
    lat_tilt_rt   = float(cur[I_LAT_TILT_RT]) if len(cur) > I_LAT_TILT_RT else 0.0
    kn_ext_rt     = float(cur[I_KN_EXT_RT])   if len(cur) > I_KN_EXT_RT  else 0.0
    arm_flail     = float(cur[I_ARM_FLAIL])    if len(cur) > I_ARM_FLAIL  else 0.0
    head_accel    = float(cur[I_HEAD_ACCEL])   if len(cur) > I_HEAD_ACCEL else 0.0
    body_sway     = float(cur[I_BODY_SWAY])    if len(cur) > I_BODY_SWAY  else 0.0
    impact        = float(cur[I_IMPACT])       if len(cur) > I_IMPACT     else 0.0

    # ── Windows ───────────────────────────────────────────────────────
    hip_y_r   = recent[:, I_V_HIP_Y]
    v_hip_r   = recent[:, I_V_HIP_Y]
    sh_tilt_r = recent[:, I_SH_TILT]
    knee_r    = recent[:, I_KNEE_AVG]
    j_hip_r   = recent[:, I_J_HIP_Y]

    # ══════════════════════════════════════════════════════════════════
    #  TẦNG 1: NEGATIVE GATES (10 gates)
    # ══════════════════════════════════════════════════════════════════
    gate_scores = {}

    # G1 — Controlled descent (ngồi từ từ)
    if n_buf >= 20:
        v20   = buf_arr[-20:, I_V_HIP_Y]
        j20   = buf_arr[-20:, I_J_HIP_Y]
        v_std = float(np.std(v20))
        v_max = float(np.max(v20))
        j_max = float(np.max(np.abs(j20)))
        kn20  = buf_arr[-20:, I_KNEE_AVG]
        kn_drop = float(kn20[0] - kn20[-1])
        is_controlled = (
            v_std < 0.07 and v_max < 0.22 and j_max < 0.14
            and float(np.mean(v20[-8:])) > 0.01
            and sh_tilt < 0.08
        )
        if is_controlled:
            gate_scores["G1"] = 0.70

    # G2 — Prolonged descent (> 22/30 frame)
    if n_buf >= 30:
        v30 = buf_arr[-30:, I_V_HIP_Y]
        n_descending = int(np.sum(v30 > 0.018))
        if n_descending >= 22:
            gate_scores["G2"] = 0.75

    # G3 — Recovery pattern (đứng dậy sau khi cúi)
    if len(hip_y_r) >= 8:
        peak_idx = int(np.argmax(hip_y_r))
        if peak_idx <= len(hip_y_r) - 4:
            recovery_vel = float(np.mean(hip_y_r[peak_idx:]))
            if recovery_vel < -0.02:
                gate_scores["G3"] = 0.85

    # G4 — Symmetric descent (ngồi thẳng)
    mean_sh_tilt = float(np.mean(sh_tilt_r))
    mean_v_hip   = float(np.mean(v_hip_r))
    if (mean_sh_tilt < 0.060 and mean_v_hip > 0.012 and spine_horiz < 0.50):
        gate_scores["G4"] = 0.60

    # G5 — Knee-bend finish (ngồi bệt xuống sàn)
    if len(knee_r) >= 8:
        knee_early = float(np.mean(knee_r[:4]))
        knee_late  = float(np.mean(knee_r[-4:]))
        knee_drop  = knee_early - knee_late
        if knee_drop > 0.16 and knee_late < 0.68:
            gate_scores["G5"] = 0.75

    # G6 — Static low posture (nằm tĩnh lâu)
    if n_buf >= 30:
        v_hip_long  = buf_arr[-30:, I_V_HIP_Y]
        spine_long  = buf_arr[-30:, I_SPINE_HORIZ]
        no_spike    = float(np.max(np.abs(v_hip_long))) < 0.18
        spine_low_all = float(np.mean(spine_long)) < 0.40
        had_spike = False
        if n_buf >= 60:
            had_spike = float(np.max(buf_arr[-60:, I_V_HIP_Y])) > 0.25
        if no_spike and spine_low_all and not had_spike:
            gate_scores["G6"] = 0.72

    # G7 — Fast sit-down (ngồi nhanh bị nhầm là ngã)
    if n_buf >= 15:
        v15      = buf_arr[-15:, I_V_HIP_Y]
        knee15   = buf_arr[-15:, I_KNEE_AVG]
        spine15  = buf_arr[-15:, I_SPINE_HORIZ]
        v_peak   = float(np.max(v15))
        knee_end = float(np.mean(knee15[-4:]))
        knee_start = float(np.mean(knee15[:4]))
        spine_end  = float(np.mean(spine15[-4:]))
        knee_bending  = (knee_start - knee_end) > 0.10
        spine_upright = spine_end > 0.55
        fast_drop     = v_peak > 0.18
        if fast_drop and knee_bending and spine_upright:
            gate_scores["G7"] = 0.78

    # G8 — Stretching / exercise (duỗi người, yoga, exercise)
    # Đặc điểm: spine_horiz thấp nhưng có knee_extension_rate cao
    # + arm_flail cao (cánh tay duỗi ra khi tập)
    # + KHÔNG có spike velocity (không ngã đột ngột)
    if n_buf >= 20:
        v20_g8   = buf_arr[-20:, I_V_HIP_Y]
        max_v_g8 = float(np.max(np.abs(v20_g8)))
        kn_ext_g8 = float(kn_ext_rt) if len(cur) > I_KN_EXT_RT else 0.0
        arm_g8    = float(arm_flail)  if len(cur) > I_ARM_FLAIL  else 0.0
        if (max_v_g8 < 0.15          # không có spike velocity
                and spine_horiz < 0.45  # spine tương đối ngang
                and kn_ext_g8 > 0.20    # đang duỗi gối (tập thể dục)
                and arm_g8 > 0.30):     # tay vung ra (duỗi người)
            gate_scores["G8"] = 0.65

    # G9 — Crawling / all-fours (bò trên tất cả 4 chi)
    # Đặc điểm: cả vai lẫn hông đều thấp + spine ngang + nhưng knee gập mạnh
    if n_buf >= 15:
        sh_hip_15 = buf_arr[-15:, I_SH_HIP_DY] if I_SH_HIP_DY < buf_arr.shape[1] else None
        if sh_hip_15 is not None:
            mean_sh_hip = float(np.mean(sh_hip_15))
            mean_spine_15 = float(np.mean(buf_arr[-15:, I_SPINE_HORIZ]))
            mean_knee_15  = float(np.mean(buf_arr[-15:, I_KNEE_AVG]))
            # Khi bò: sh_hip_dy thấp (vai-hông gần nhau theo chiều đứng),
            # spine ngang, knee gập (knee_avg thấp)
            is_crawling = (
                mean_sh_hip < 0.20
                and mean_spine_15 < 0.40
                and mean_knee_15  < 0.55
            )
            if is_crawling:
                gate_scores["G9"] = 0.68

    # G10 — Dance / aerobics (nhảy, aerobic)
    # Đặc điểm: pose_energy rất cao NHƯNG body_sway thấp (nhảy có kiểm soát)
    # + không có prolonged descent (không nằm xuống)
    # + asymmetry cao xen kẽ (chuyển động nhịp nhàng)
    if n_buf >= 20:
        energy_20 = buf_arr[-20:, I_POSE_ENERGY] if I_POSE_ENERGY < buf_arr.shape[1] else None
        if energy_20 is not None:
            mean_energy = float(np.mean(energy_20))
            sway_g10    = float(body_sway) if len(cur) > I_BODY_SWAY else 0.0
            v20_g10     = buf_arr[-20:, I_V_HIP_Y]
            max_v_g10   = float(np.max(np.abs(v20_g10)))
            asym_std_g10 = float(np.std(buf_arr[-20:, I_ASYMMETRY])) \
                           if I_ASYMMETRY < buf_arr.shape[1] else 0.0
            is_dancing = (
                mean_energy > 0.30      # nhiều chuyển động
                and sway_g10 < 0.25     # không có sway đột ngột
                and max_v_g10 < 0.28    # không có velocity spike lớn
                and asym_std_g10 > 0.05 # asymmetry biến đổi nhịp nhàng (không cố định)
            )
            if is_dancing:
                gate_scores["G10"] = 0.60

    # Tổng hợp gate: lấy max của các gate có trọng số
    gate = max(gate_scores.values()) if gate_scores else 0.0

    # Nếu gate rất cao → tra về ngay
    if gate >= 0.85:
        return 0.0

    # ══════════════════════════════════════════════════════════════════
    #  TẦNG 2: POSITIVE RULES (14 rules)
    # ══════════════════════════════════════════════════════════════════
    scores = []

    # R1 — Horizontal body (ngã nằm ngang rõ ràng)
    if bbox_ar > 1.2 and spine_horiz < 0.35:
        s = (bbox_ar - 1.2) * 2.0 + (0.35 - spine_horiz) * 2.0
        scores.append(("R1", min(1.0, s)))

    # R2 — Rapid drop + velocity spike
    sum_v_hip = float(np.sum(v_hip_r))
    max_v_hip = float(np.max(v_hip_r))
    if sum_v_hip > 0.30 and max_v_hip > 0.15:
        scores.append(("R2", min(1.0, sum_v_hip * 3.0)))

    # R3 — Lying + straight knees + shoulder tilt
    if spine_horiz < 0.30 and knee_avg > 0.80 and sh_tilt > 0.03:
        scores.append(("R3", min(1.0, 0.65 + (0.30 - spine_horiz) * 1.5)))

    # R4 — Head at hip level
    if head_hip_dy < 0.15:
        scores.append(("R4", min(1.0, (0.15 - head_hip_dy) * 10.0)))

    # R5 — Head free-fall
    if v_nose > 0.05 and a_nose > 0.0:
        scores.append(("R5", min(1.0, v_nose * 8.0)))

    # R6 — 3D forward/backward fall
    if spine_dtilt > 0.35 or trunk_a3d > 0.45:
        s6 = max(
            min(1.0, (spine_dtilt - 0.35) * 3.0) if spine_dtilt > 0.35 else 0.0,
            min(1.0, (trunk_a3d  - 0.45) * 3.0) if trunk_a3d  > 0.45 else 0.0,
        )
        if s6 > 0.1:
            scores.append(("R6", s6))

    # R7 — 3D lying flat
    if spine_a3d > 0.50:
        scores.append(("R7", min(1.0, (spine_a3d - 0.50) * 4.0)))

    # R8 — 3D hip Z velocity
    if abs(v_hip_z) > 0.30:
        scores.append(("R8", min(1.0, abs(v_hip_z) * 1.5)))

    # R9 — Asymmetric impact (nghiêng + jerk khi chạm đất)
    tilt_avg = (sh_tilt + hip_tilt) / 2.0
    if tilt_avg > 0.055 and abs(j_hip) > 0.18:
        scores.append(("R9", min(1.0, tilt_avg * 4.5 + abs(j_hip) * 1.5)))

    # R10 — Slow lean fall (ngã dựa tường, ngã chậm có điểm tựa)
    if n_buf >= 20:
        spine20   = buf_arr[-20:, I_SPINE_HORIZ]
        sh_tilt20 = buf_arr[-20:, I_SH_TILT]
        knee20    = buf_arr[-20:, I_KNEE_AVG]
        mean_spine20 = float(np.mean(spine20))
        mean_tilt20  = float(np.mean(sh_tilt20))
        mean_knee20  = float(np.mean(knee20))
        lean_fall = (
            0.25 < mean_spine20 < 0.65
            and mean_tilt20  > 0.07
            and mean_knee20  > 0.70
            and spine_a3d    > 0.38
            and head_hip_dy  < 0.30
        )
        if lean_fall:
            s10 = min(1.0, mean_tilt20 * 5.0 + (0.65 - mean_spine20) * 1.5)
            scores.append(("R10", s10))

    # R11 — Stumble / trip (vấp ngã nhanh)
    # Đặc điểm: impact_score cao + hip_accel_mag cao + xảy ra trong < 10 frame
    if impact > 0.30 and hip_accel > 0.25:
        s11 = min(1.0, (impact + hip_accel) * 1.5)
        scores.append(("R11", s11))

    # R12 — Slow lean elderly (ngã từ từ của người già)
    # Đặc điểm: spine_horiz tăng dần rất chậm, descent_ratio trung bình,
    # NHƯNG head_hip_dy cuối cùng rất thấp
    if n_buf >= 40:
        spine40 = buf_arr[-40:, I_SPINE_HORIZ]
        head40  = buf_arr[-40:, I_HEAD_HIP_DY] if I_HEAD_HIP_DY < buf_arr.shape[1] else None
        if head40 is not None:
            spine_early_40 = float(np.mean(spine40[:10]))
            spine_late_40  = float(np.mean(spine40[-10:]))
            head_final     = float(np.mean(head40[-5:]))
            slow_lean = (
                spine_late_40 > spine_early_40 + 0.20  # spine dần nằm ngang
                and head_final < 0.25                   # đầu đã xuống gần hông
                and spine_late_40 > 0.35                # đang nằm ngang đáng kể
            )
            if slow_lean:
                s12 = min(1.0, (spine_late_40 - spine_early_40) * 2.5)
                scores.append(("R12", s12))

    # R13 — Lateral side-fall (ngã sang một bên)
    # Đặc điểm: lateral_tilt_rate cao + asymmetry cao + spine_angle_3d cao
    if lat_tilt_rt > 0.20 and asymmetry > 0.25 and spine_a3d > 0.30:
        s13 = min(1.0, lat_tilt_rt * 2 + asymmetry * 1.5)
        scores.append(("R13", s13))

    # R14 — Forward momentum fall (ngã về phía trước do mất đà)
    # Đặc điểm: head_accel_mag cao + trunk_angle_3d cao
    # + velocity mũi xuống (nose đi về trước)
    if head_accel > 0.30 and trunk_a3d > 0.35 and v_nose > 0.03:
        s14 = min(1.0, head_accel * 1.5 + trunk_a3d)
        scores.append(("R14", s14))

    # ── Top-down camera detection ──────────────────────────────────────
    _td_bbox   = float(np.clip(1.0 - abs(bbox_ar - 1.0) * 2.0, 0, 1))
    _td_spine  = float(np.clip((spine_horiz - 0.45) / 0.40, 0, 1))
    _td_head   = float(np.clip(1.0 - head_hip_dy / 0.20, 0, 1))
    top_down_score = float(np.clip((_td_bbox * 0.35 + _td_spine * 0.40 + _td_head * 0.25), 0, 1))
    is_top_down    = top_down_score > 0.45

    # R11-topdown: camera nhìn từ trên với 3D signals
    if is_top_down:
        gate = gate * 0.6  # giảm gate khi top-down (nhiều FP hơn)
        if spine_a3d > 0.40 and (v_hip_z > 0.20 or spine_dtilt > 0.25):
            s_td = min(1.0, spine_a3d * 1.5 + spine_dtilt)
            scores.append(("Rtd", s_td))

    # ── Positive score ────────────────────────────────────────────────
    if not scores:
        return 0.0

    pos_score = sum(s for _, s in scores) / max(len(scores), 1)
    pos_score = min(1.0, pos_score * 1.2)  # boost nhẹ khi có nhiều rules

    # ── Near-camera suppression ───────────────────────────────────────
    near_cam_factor = float(np.clip((near_cam - 0.4) / 0.6, 0, 0.3))

    # ── Final: gate * (1 - near_cam) ──────────────────────────────────
    final = pos_score * (1.0 - gate) * (1.0 - near_cam_factor)
    return float(np.clip(final, 0, 1))


# ======================================================================
# Temporal helpers: Bayesian smoother / scene / stillness
# ======================================================================
class BayesianSmoother:
    """
    Làm mượt xác suất theo thời gian với exponential window.
    Phản ứng nhanh hơn khi prob tăng (ngã), chậm hơn khi giảm (hồi phục).
    """
    def __init__(self, alpha_rise=0.60, alpha_fall=0.35):
        self.alpha_rise = alpha_rise
        self.alpha_fall = alpha_fall
        self.smooth     = 0.0

    def update(self, raw_prob: float) -> float:
        if raw_prob > self.smooth:
            alpha = self.alpha_rise
        else:
            alpha = self.alpha_fall
        self.smooth = alpha * raw_prob + (1.0 - alpha) * self.smooth
        return self.smooth

    def reset(self):
        self.smooth = 0.0

class SceneClassifier:
    """
    Nhận diện scene từ features để điều chỉnh threshold:
    - Top-down camera (CCTV trần nhà)
    - Low-light
    - Người quá gần camera
    """
    def __init__(self, window=30):
        self.window  = window
        self.history = []  # list of feature vectors

    def update(self, feat_vec):
        self.history.append(feat_vec.copy())
        if len(self.history) > self.window:
            self.history.pop(0)

    def get_scene_adjustment(self) -> float:
        """Trả về delta threshold (dương = tăng threshold, âm = giảm)."""
        if len(self.history) < 5:
            return 0.0

        arr = np.array(self.history[-10:], dtype=np.float32)

        # Top-down detection
        mean_bbox_ar   = float(np.mean(arr[:, 4]))  # bbox_ar
        mean_spine_h   = float(np.mean(arr[:, 1]))  # spine_horiz
        mean_head_hip  = float(np.mean(arr[:, 6]))  # head_hip_dy
        td_score = (
            float(np.clip(1.0 - abs(mean_bbox_ar - 1.0) * 2, 0, 1)) * 0.35
            + float(np.clip((mean_spine_h - 0.45) / 0.40, 0, 1)) * 0.40
            + float(np.clip(1.0 - mean_head_hip / 0.20, 0, 1)) * 0.25
        )
        is_topdown = td_score > 0.45

        # Low-light detection
        mean_vis = float(np.mean(arr[:, 17]))
        is_lowlight = mean_vis < 0.45

        delta = 0.0
        if is_topdown and CONFIG.get("scene_aware_threshold", True):
            delta += CONFIG.get("scene_topdown_boost", 0.08)
        if is_lowlight and CONFIG.get("scene_aware_threshold", True):
            delta -= CONFIG.get("scene_lowlight_reduce", 0.05)

        return float(np.clip(delta, -0.10, 0.15))

    def reset(self):
        self.history.clear()

class StillnessValidator:
    def __init__(self):
        self._buf = []

    def update(self, feat_vec):
        self._buf.append(feat_vec.copy())
        win = CONFIG.get("stillness_window", 45)
        if len(self._buf) > win:
            self._buf.pop(0)

    def is_real_fall(self):
        if len(self._buf) < CONFIG.get("stillness_min_frames", 10):
            return False
        arr  = np.array(self._buf, dtype=np.float32)
        v12  = arr[:, 12]; v13  = arr[:, 13]
        m12  = float(np.mean(np.abs(v12)))
        m13  = float(np.mean(np.abs(v13)))
        thr  = CONFIG.get("stillness_threshold", 0.04)
        return (m12 < thr and m13 < thr)

    def reset(self):
        self._buf.clear()


# ======================================================================
#  GLUE: MediaPipe Pose + trained model + single-person fall engine
#  (written for this project; drives the extracted logic above)
# ======================================================================
import os

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "model_v8")
_TFLITE_PATH = os.path.join(_MODEL_DIR, "best_model.tflite")
_KERAS_PATH = os.path.join(_MODEL_DIR, "best_model.keras")
_POSE_TASK = os.path.join(_MODEL_DIR, "pose_landmarker_full.task")


def models_available():
    """True when the MediaPipe task + a trained model are present."""
    return os.path.exists(_POSE_TASK) and (os.path.exists(_TFLITE_PATH) or os.path.exists(_KERAS_PATH))


class _PoseRunner:
    """MediaPipe Pose Landmarker (IMAGE mode) -> (lm2d, lm_world)."""

    def __init__(self):
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision as mp_vision
        opts = mp_vision.PoseLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=_POSE_TASK),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.det = mp_vision.PoseLandmarker.create_from_options(opts)

    def run(self, frame_bgr):
        import cv2
        import mediapipe as mp
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = self.det.detect(mp_img)
        if not res.pose_landmarks:
            return None
        lm2d = res.pose_landmarks[0]
        lm_world = res.pose_world_landmarks[0] if res.pose_world_landmarks else None
        return (lm2d, lm_world)


class _Model:
    """Loads best_model.tflite (preferred) or .keras; predict -> P(fall)."""

    def __init__(self):
        import tensorflow as tf
        if os.path.exists(_TFLITE_PATH):
            self.interp = tf.lite.Interpreter(model_path=_TFLITE_PATH)
            self.interp.allocate_tensors()
            self.ind = self.interp.get_input_details()
            self.outd = self.interp.get_output_details()
            self.mode = "tflite"
        else:
            self.model = tf.keras.models.load_model(_KERAS_PATH, compile=False)
            self.mode = "keras"

    def predict_fall(self, seq):
        """seq: (seq_len, 38) -> P(fall)."""
        inp = np.asarray(seq, dtype=np.float32)[None, ...]
        if self.mode == "tflite":
            self.interp.set_tensor(self.ind[0]["index"], inp)
            self.interp.invoke()
            out = np.asarray(self.interp.get_tensor(self.outd[0]["index"]))[0]
        else:
            out = self.model(inp, training=False)
            if isinstance(out, (list, tuple)):
                out = out[0]
            out = np.asarray(out)[0]
        return float(out[1]) if np.ndim(out) and len(out) >= 2 else float(np.ravel(out)[0])


class MediaPipeFallEngine:
    """Per-connection trained-model fall detector for the dominant person.

    process(frame_bgr, now) -> dict(fall, prob, status, box, landmarks).
    Mirrors the reference runtime: features -> [model ensemble rule] ->
    Bayesian smooth -> scene/near-cam threshold -> accum + confirm -> latch.
    """

    SEQ = CONFIG["sequence_length"]
    EW = CONFIG["ensemble_weights"]
    ACCUM_THR = CONFIG["accum_threshold"]
    CONFIRM = CONFIG["confirm_frames"]
    LATCH_S = 8.0

    _pose = None     # shared, lazily loaded
    _model = None

    def __init__(self):
        self.buf = []
        self.feat_history = []
        self.prev_state = None
        self.smoother = BayesianSmoother(
            alpha_rise=CONFIG["bayes_rise_alpha"], alpha_fall=CONFIG["bayes_alpha"])
        self.scene = SceneClassifier()
        self.accum = 0.0
        self.confirm_cnt = 0
        self.fallen_until = 0.0

    @classmethod
    def ensure_loaded(cls):
        if cls._pose is None:
            cls._pose = _PoseRunner()
        if cls._model is None:
            cls._model = _Model()

    def process(self, frame_bgr, now):
        self.ensure_loaded()
        pair = self._pose.run(frame_bgr)
        if pair is None:
            prob = self.smoother.update(0.0)
            self.accum = max(prob, self.accum * 0.92)
            self.confirm_cnt = 0
            return {"fall": now < self.fallen_until, "prob": prob,
                    "status": "unknown", "box": None, "landmarks": None}

        lm2d, _ = pair
        feat, self.prev_state = extract_features(pair, self.prev_state, self.feat_history)
        self.feat_history.append(feat)
        if len(self.feat_history) > 30:
            self.feat_history.pop(0)
        self.buf.append(feat)
        if len(self.buf) > 90:
            self.buf.pop(0)

        xs = [p.x for p in lm2d]
        ys = [p.y for p in lm2d]
        box_norm = [min(xs), min(ys), max(xs), max(ys)]

        rule_prob = rule_based_score(self.buf)
        if len(self.buf) >= self.SEQ:
            lstm_prob = self._model.predict_fall(self.buf[-self.SEQ:])
            raw = self.EW[0] * lstm_prob + self.EW[1] * rule_prob
        else:
            raw = rule_prob  # warming up the sequence buffer: rules only

        prob = self.smoother.update(raw)
        self.scene.update(feat)
        delta = self.scene.get_scene_adjustment()
        self.accum = max(prob, self.accum * 0.92)
        nc = float(feat[24]) if len(feat) > 24 else 0.0
        nc_boost = 0.15 if nc > 0.6 else (0.08 if nc > 0.4 else 0.0)
        thr = self.ACCUM_THR + nc_boost + delta

        if self.accum >= thr:
            self.confirm_cnt += 1
        else:
            self.confirm_cnt = 0
        if self.confirm_cnt >= self.CONFIRM:
            self.fallen_until = now + self.LATCH_S

        confirmed = now < self.fallen_until
        status = "fallen" if confirmed else ("falling" if prob > 0.4 else "standing")
        return {"fall": confirmed, "prob": prob, "status": status,
                "box": box_norm, "landmarks": [(p.x, p.y) for p in lm2d]}
