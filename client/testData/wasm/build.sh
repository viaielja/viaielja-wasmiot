cargo build --release --target wasm32-unknown-unknown
cargo build --release --target wasm32-wasi

mkdir -p ../wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/*.wasm ../wasm32-unknown-unknown

mkdir -p ../wasm32-wasi
cp target/wasm32-wasi/release/*.wasm ../wasm32-wasi
