module.exports =
  options:
    mode: 'zip'
  chromium:
    options:
      archive: '../dist/chromium-release.zip'
    files: [
      {
        cwd: 'build'
        src: ['**', '!manifest.json']
        expand: true
        filter: 'isFile'
      }
      {
        cwd: 'tmp/chromium/'
        src: 'manifest.json'
        expand: true
      }
    ]
