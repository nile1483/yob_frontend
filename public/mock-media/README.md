# Mock media

Design/development content only. These are flat SVGs at deliberately different intrinsic
sizes - portrait, landscape, square, and one very large - used by the mock fixtures to
prove that a source image's dimensions cannot affect the layout around it.

They are **not** production assets and not fallbacks. The neutral no-image placeholder is
drawn inline by `design/media`, so nothing here ships to a buyer: `angular.json` adds this
directory to the asset list only for the `mock` configuration, the same structural
guarantee `fileReplacements` gives the mock API code.

Replacing them with real photography would defeat the point - a flat rectangle labelled
with its ratio makes a cropping or stretching bug obvious at a glance, where a photograph
would hide it.
