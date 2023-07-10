import { createServerApp } from "../../index"
import match from "../../match"

createServerApp({
    id: "cli",
    modules: {
        match
    }
})
