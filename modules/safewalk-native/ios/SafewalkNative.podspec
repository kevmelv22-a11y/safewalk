require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'SafewalkNative'
  s.version        = package['version']
  s.summary        = 'SafeWalk foreground hardware helpers'
  s.description    = 'Foreground volume double-press helpers with honest platform limits'
  s.license        = 'MIT'
  s.author         = 'Vonk Byte'
  s.homepage       = 'https://github.com/kevmelv22-a11y/safewalk'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/kevmelv22-a11y/safewalk.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
