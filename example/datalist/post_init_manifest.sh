curl http://localhost:3000/file/manifest \
    -X POST \
    --header "Content-Type: application/json" \
    --data '{
        "name": "Datalist initializer",
        "sequence": [
            {
                "device": null,
                "module": "core:Datalist",
                "func": "init"
            }
        ]
    }'
