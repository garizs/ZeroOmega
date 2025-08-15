# Testing Guide

## Build the extension

```
cd omega-build
npm run deps
npm run dev
npm run build
```

Built files appear in `omega-target-chromium-extension/build`.

## Enable logging

Open the background service worker console in your browser's extensions page to view log output and captured failures.

## View failures

1. Load the unpacked extension in Chromium or Orion.
2. Open the options page and select the **Failures (beta)** tab.
3. Trigger a failing network request (e.g. visit a blocked or invalid domain).
4. The failing host should appear in the list within a few seconds.
5. Use **Refresh** to update manually or keep auto‑refresh enabled.

## Add to proxy list

1. In the **Failures (beta)** panel, click **Add to Proxy list** for a host.
2. The background script POSTs `{"domain": "<host>"}` to `http://127.0.0.1:9099/add-domain`.
3. A toast indicates success or failure.

## Orion verification

On macOS, load the extension in Orion as an unpacked extension.
Confirm that network failures populate the panel and that the POST to the local endpoint succeeds.
