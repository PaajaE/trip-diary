// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.pnpm/@capacitor+app@8.1.0_@capacitor+core@8.4.0/node_modules/@capacitor/app"),
        .package(name: "CapacitorCamera", path: "../../../node_modules/.pnpm/@capacitor+camera@8.2.0_@capacitor+core@8.4.0/node_modules/@capacitor/camera"),
        .package(name: "CapacitorGeolocation", path: "../../../node_modules/.pnpm/@capacitor+geolocation@8.2.0_@capacitor+core@8.4.0/node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorNetwork", path: "../../../node_modules/.pnpm/@capacitor+network@8.0.1_@capacitor+core@8.4.0/node_modules/@capacitor/network"),
        .package(name: "CapawesomeCapacitorFilePicker", path: "../../../node_modules/.pnpm/@capawesome+capacitor-file-picker@8.0.2_@capacitor+core@8.4.0/node_modules/@capawesome/capacitor-file-picker")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapawesomeCapacitorFilePicker", package: "CapawesomeCapacitorFilePicker")
            ]
        )
    ]
)
