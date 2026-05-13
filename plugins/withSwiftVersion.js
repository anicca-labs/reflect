const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Sets SWIFT_VERSION = '5.0' for all pod targets.
// Required when building with Xcode 16.3+ (Swift 6.1.2): expo-modules-core uses
// concurrency syntax that compiles cleanly in Swift 5 mode but errors in Swift 6
// strict concurrency mode.
const SWIFT_VERSION_SNIPPET = `
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_VERSION'] = '5.0'
    end
  end`

const withSwiftVersion = (config) =>
  withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      if (!fs.existsSync(podfilePath)) return config

      let contents = fs.readFileSync(podfilePath, 'utf-8')
      if (contents.includes("build_settings['SWIFT_VERSION'] = '5.0'")) return config

      // Inject into the existing post_install block (CocoaPods rejects multiple blocks)
      if (contents.includes('post_install do |installer|')) {
        contents = contents.replace(
          'post_install do |installer|',
          `post_install do |installer|${SWIFT_VERSION_SNIPPET}`
        )
      } else {
        // No existing block — add one
        contents += `\npost_install do |installer|${SWIFT_VERSION_SNIPPET}\nend\n`
      }

      fs.writeFileSync(podfilePath, contents)
      return config
    },
  ])

module.exports = withSwiftVersion
