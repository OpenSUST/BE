import { registerResolver } from "../api";

registerResolver('Query', 'hello(foo: ObjectID)', 'String', (args, ctx, info) => {
    return 'Hello world!';
});
