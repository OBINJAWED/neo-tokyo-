---
name: 3D preview verification
description: Distinguishing the capture browser's GPU limitations from failures in the Tokyo scene.
---

Do not assume the city renderer is broken when the standard screenshot browser displays the WebGL-unavailable fallback.

**Why:** In this environment, the standard screenshot browser had no WebGL context, while local Chromium with explicitly enabled SwiftShader rendered the same application successfully.

**How to apply:** Keep the application's honest unsupported-browser message. For visual verification, use a static capture in a renderer with WebGL 2 support; software rendering is sufficient to inspect the scene but is not representative of hardware frame rates.
