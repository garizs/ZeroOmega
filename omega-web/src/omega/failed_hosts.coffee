angular.module('omega').factory 'failedHosts', ($q) ->
  send = (msg) ->
    d = $q.defer()
    chrome.runtime.sendMessage msg, (res) ->
      if chrome.runtime.lastError?
        d.reject chrome.runtime.lastError
      else
        d.resolve res
    d.promise
  list: -> send type: 'GET_FAILED_HOSTS'
  clear: -> send type: 'CLEAR_FAILED_HOSTS'
  send: (host) -> send type: 'SEND_HOST_TO_LOCAL', host: host
