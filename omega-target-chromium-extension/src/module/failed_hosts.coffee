api = chrome ? browser
storage = api.storage?.session ? api.storage?.local
MAX = 200
DEBOUNCE = 1000
IGNORES = [
  'sentry.io'
  'doubleclick.net'
  'googletagmanager.com'
  'facebook.net'
  'scorecardresearch.com'
  'adsystem'
]

module.exports = class FailedHosts
  constructor: ->
    @hosts = {}
    @order = []
    @lastEvents = {}
    storage?.get {failedHosts: []}, (res) =>
      for item in res?.failedHosts ? []
        @hosts[item.host] = item
        @order.push item.host
    if api.webRequest?
      filter = {urls: ['<all_urls>']}
      api.webRequest.onErrorOccurred.addListener(@_onError, filter)
      api.webRequest.onCompleted.addListener(@_onCompleted, filter)

  _save: ->
    items = @order.map (h) => @hosts[h]
    storage?.set {failedHosts: items}

  _record: (host, error, tabId) =>
    for i in IGNORES when host.includes(i)
      return
    now = Date.now()
    key = host + '|' + error
    last = @lastEvents[key]
    return if last? and now - last < DEBOUNCE
    @lastEvents[key] = now
    entry = @hosts[host]
    if entry?
      entry.lastError = error
      entry.lastSeen = now
      entry.hits += 1
    else
      entry =
        host: host
        lastError: error
        firstSeen: now
        lastSeen: now
        hits: 1
        pageOrigins: []
      @hosts[host] = entry
      @order.unshift host
      if @order.length > MAX
        old = @order.pop()
        delete @hosts[old]
    if tabId? and tabId >= 0 and api.tabs?
      try
        api.tabs.get tabId, (tab) =>
          origin = ''
          try
            origin = new URL(tab.url).origin if tab?.url
          if origin and origin != 'null'
            idx = entry.pageOrigins.indexOf(origin)
            entry.pageOrigins.splice(idx,1) if idx >= 0
            entry.pageOrigins.unshift origin
            entry.pageOrigins = entry.pageOrigins.slice(0,5)
          @_save()
      catch err
        @_save()
    else
      @_save()

  _onError: (details) =>
    try
      host = new URL(details.url).hostname
    catch err
      return
    @_record host, details.error, details.tabId

  _onCompleted: (details) =>
    return unless details.statusCode? and details.statusCode >= 400
    try
      host = new URL(details.url).hostname
    catch err
      return
    @_record host, '' + details.statusCode, details.tabId

  list: ->
    list = @order.map (h) => @hosts[h]
    list.sort (a, b) -> b.lastSeen - a.lastSeen
    Promise.resolve list

  clear: ->
    @hosts = {}
    @order = []
    @lastEvents = {}
    @_save()
    Promise.resolve()

  send: (host) ->
    fetch 'http://127.0.0.1:9099/add-domain',
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body: JSON.stringify domain: host
    .then (res) ->
      {ok: res.ok}
    .catch (e) ->
      {ok: false, error: e.message}
