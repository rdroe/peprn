
This is an app for creating a repl in node or browser that runs custom cli-style commands.

Build with `yarn build`.
Run an example with 
- `yarn http-serve`
- open the browser to localhost:8080
- in the text area, enter e.g. `match scalar -l 100 -r 101`, a test command
- this should print output, the command's result

Built into the build is a node example. The shipped compiled typescript (javascript) should let you do this:

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

