ObjC.import('AppKit');
function run() {
  var application = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('http://my.hephaera.com'));
  var applicationPath = ObjC.unwrap(application.path);
  if (typeof applicationPath !== 'string' || !applicationPath) throw new Error('Default HTTP browser registration unavailable.');
  return applicationPath;
}
