import AppKit

signal(SIGPIPE, SIG_IGN)

let arguments = CommandLine.arguments
if arguments.contains("--probe-ax") {
    Probe.dumpInputs()
    Log.flush()
    exit(0)
}
if arguments.contains("--probe-windows") {
    Probe.watchWindows()
    Log.flush()
    exit(0)
}
if arguments.contains("--probe-buttons") {
    Probe.dumpButtons()
    Log.flush()
    exit(0)
}
if let flag = arguments.firstIndex(of: "--ax"), flag + 1 < arguments.count {
    Probe.setAccessibility(arguments[flag + 1] == "on")
    Log.flush()
    exit(0)
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let controller = AppController()
application.delegate = controller
application.run()
