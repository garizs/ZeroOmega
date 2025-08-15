angular.module('omega').controller 'FailuresCtrl', (
  $scope, $rootScope, $interval, failedHosts
) ->
  $scope.failed = []
  $scope.search = ''
  $scope.autoRefresh = true

  timer = null
  refresh = ->
    failedHosts.list().then (list) ->
      $scope.failed = list
  $scope.refresh = refresh

  $scope.clear = ->
    failedHosts.clear().then ->
      $scope.failed = []

  $scope.toggleAuto = ->
    if $scope.autoRefresh
      start()
    else
      stop()

  start = ->
    stop()
    timer = $interval(refresh, 5000)
  stop = ->
    $interval.cancel(timer) if timer?
    timer = null

  $scope.add = (host) ->
    failedHosts.send(host).then (res) ->
      if res?.ok
        $rootScope.showAlert type: 'success', message: 'Added'
      else
        $rootScope.showAlert type: 'error', message: res?.error or 'Error'
  $scope.copy = (host) ->
    navigator.clipboard?.writeText(host)
    $rootScope.showAlert type: 'success', message: 'Copied'

  $scope.$on '$destroy', stop
  refresh()
  start()
