# Third-party notices

## TalkingHead 3D avatar runtime
- Project: https://github.com/met4citizen/TalkingHead
- Package: `@met4citizen/talkinghead` v1.8.0
- License: MIT
- Runtime source is loaded from the public esm.sh CDN; no API key or paid account is required.
- The package's MIT license permits commercial and non-commercial use, subject to retaining the copyright and license notice when redistributing the software.

## Default 3D avatar model
- Asset: `avatars/mpfb.glb` from https://github.com/met4citizen/TalkingHead
- Creator/source: Blender + MPFB
- License identified by the TalkingHead project: CC0 (public domain dedication)
- The model is fetched on demand from the upstream public repository and is not copied into this repository. It is a large asset, so first-time loading can take time and uses network data.

## Notes
The avatar is rendered locally in the user's browser. ZEREOS does not send narration or uploaded models to an avatar-generation server. Custom GLB models are loaded from the user's local browser session.
