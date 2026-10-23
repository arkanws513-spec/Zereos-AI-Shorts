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


## Arabic text-to-speech runtime
- Project: https://github.com/Oddadmix/nabra-tts
- Browser wrapper code: Apache-2.0.
- Model: [Nabra-7M-Distill](https://huggingface.co/oddadmix/Nabra-7M-Distill), Apache-2.0; downloaded and cached by the browser at runtime.
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime, MIT License; only the matching JSEP loader and WebAssembly binary are shipped in `vendor/ort/`.
- Bundled eSpeak NG 1.52.0 and Arabic/English phoneme data: GNU GPL-3.0-or-later. See the upstream [Nabra third-party notices](https://github.com/Oddadmix/nabra-tts/blob/main/THIRD_PARTY_NOTICES.md) and retain the applicable license notices when redistributing.

## Notes
The avatar is rendered locally in the user's browser. ZEREOS does not send narration or uploaded models to an avatar-generation server. Custom GLB models are loaded from the user's local browser session.
