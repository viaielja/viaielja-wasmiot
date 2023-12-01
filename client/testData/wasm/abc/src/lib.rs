//! This crate contains functions that for testing purposes demonstrate variety of things possible
//! in Wasm-IoT WebAssembly functions without the use of non-WASI host imports.
//!
//! Expected mounts are:
//! - deployFile
//! - execFile
//! - outFile

use std::collections::hash_map::DefaultHasher;
use std::hash::Hasher;


#[derive(Debug)]
enum MountReadFailed {
    Deploy = -1,
    Exec = -2,
    Out = 404,
}

fn handle_error(e: MountReadFailed) -> i32 {
    eprintln!("Reading a mount-file failed: {:?}", e);

    e as i32
}

/// Demonstrates reading from files and returning signed 32bit integer.
pub fn a(p0: u32, p1: f32) -> i32 {
    let Ok(dbytes) = std::fs::read("deployFile") else { return handle_error(MountReadFailed::Deploy) };
    let Ok(ebytes) = std::fs::read("execFile") else { return handle_error(MountReadFailed::Exec) };
    // Do something with the files to indicate they are really read.
    let mut hasher = DefaultHasher::new();
    hasher.write(&dbytes);
    hasher.write(&ebytes);

    let result = p0 as i32 + p1 as i32 + hasher.finish() as i32;

    // Always return a negative value.
    if result <= 0 { result.saturating_sub(1) } else { -result }
}

/// Demonstrates returning a 32bit floating point value.
pub fn b() -> f32 {
    4.2
}

/// Demonstrates writing to a file and returning unsigned 32bit integer.
pub fn c() -> u32 {
    // Write something into the file to indicate it is really manipulated.
    let Ok(_) = std::fs::write("outFile", b"42") else { return handle_error(MountReadFailed::Out) as u32 };

    u32::MAX
}
