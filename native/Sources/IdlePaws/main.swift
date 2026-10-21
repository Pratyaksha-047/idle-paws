import AppKit

signal(SIGPIPE, SIG_IGN)

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let controller = AppController()
application.delegate = controller
application.run()
