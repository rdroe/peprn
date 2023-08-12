
This is an app for creating a repl in node or browser that runs custom cli-style commands.
It ships with react bindings.

### Run node example
Clone the repo; build with `yarn build`.
Built into the build is a node example. The compiled typescript (javascript) should let you do this:

`node dist/testable/node/index.js`

A prompt; at which you should type

`match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world`

Result should look like 

```
{
  'match scalar': [
    { index: 0, match: true, left: 1, right: 1 },
    { index: 1, match: false, left: 'a', right: 'b' },
    {
      index: 2,
      match: false,
      left: 'hellllllo',
      right: 'hellllllllllo'
    },
    { index: 3, match: true, left: 'world', right: 'world' }
  ],
  match: 4
}
```

### Generate and run the react example
This utility also has basic react bindings. Like everything else, these yet lack documentation, but you can easily generate a running example.

Run `yarn ts-node examples/browser.ts`. 

This will create the app in a directory of your prompting.

It will run the app at port 8080, whereon you can run the `match scalar` example from above.

### Build and see browser example (without react)
Run an example by following these steps. 
- run `yarn add -D react` (react is not used in the example; but esbuild requires its installation!)
- run `yarn http-server` in the terminal at the repo root
- open the browser to localhost:8080
- in the text area, enter e.g. `match scalar -l 100 -r 101`, a test command
- this should print output, which is the job of this example command
