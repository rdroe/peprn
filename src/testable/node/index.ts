import { createServerApp } from "../../index"
import match from "../../match"
import { foo } from "../foo"
import { cliTest } from "../cliTest"
createServerApp({
    id: "cli",
    modules: {
        match, foo, cliTest
    }
})
