# Changelog

## 0.1.3

### Fixed
- Register the OpenClaw web_search provider synchronously during plugin registration.
- Ensure the iflow web_search provider exposes an executable tool instead of a null createTool result.
- Fix OpenClaw unified web_search routing so provider="iflow" can execute successfully.

### Added
- OpenClaw web_search provider: iflow.
- Tools:
  - iflow_web_search
  - iflow_image_search
  - iflow_web_fetch
- iFlow Search skill packaging.

### Verified
- Fresh profile install with @iflow-ai/iflow-plugin@0.1.3.
- plugins inspect iflow shows loaded.
- Capabilities include web-search: iflow.
- infer web search returns provider="iflow" with non-empty results.

## 0.1.2

### Known issue
- Contains an async provider registration timing issue in OpenClaw.
- Do not recommend this version for OpenClaw web_search provider usage.
- Use 0.1.3 or later.
