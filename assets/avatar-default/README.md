# Default-avatar mannequin (ChatGPT Plus, owner-generated 2026-09-16) — source
# + both style renditions. Keep all three; they are the default avatar family.
#
# mannequin-source.png       the ChatGPT-generated white mannequin (1254x1254)
# mannequin-avatar-pixar.png RealCartoon img2img v1 (strength 0.45, de-featured
#                            prompt, ip 0.8, pad 2.2) — owner-approved
# mannequin-avatar-line.png  Informative-Drawings ANIME line-art (pad 2.2)
#
# Regenerate:
#   python tools/avatar_pipeline.py --lane pixar --strength 0.45 \
#     --prompt "3d render style, pixar 3d animation character look, blank white
#     mannequin bust, completely featureless face, no eyes, no nose, no mouth,
#     no ears, no eyebrows, smooth blank head, matte white, wearing a simple
#     white t-shirt, plain white background, head and shoulders" \
#     --input assets/avatar-default/mannequin-source.png \
#     --output assets/avatar-default/mannequin-avatar-pixar.png
#   python tools/avatar_pipeline.py --lane line-art \
#     --input assets/avatar-default/mannequin-source.png \
#     --output assets/avatar-default/mannequin-avatar-line.png