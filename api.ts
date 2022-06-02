import { ApolloServer, gql } from 'apollo-server';
import { typeDefs, resolvers as scalarResolvers } from 'graphql-scalars';
import * as bus from './bus';

const types: Record<string, Record<string, string>> = {};
const unions: Record<string, string> = {};
const descriptions: Record<string, Record<string, string>> = {};
const handlers: Record<string, Record<string, any>> = {
    ...scalarResolvers,
    Query: {},
};

export function registerValue(typeName: string, key: string, value: string, description?: string): void;
export function registerValue(typeName: string, vals: [string, string, string?][]): void;
export function registerValue(typeName: string, arg1: [string, string, string?][] | string, value?: string, description?: string) {
    if (typeof arg1 === 'string') arg1 = [[arg1, value!, description]];
    for (const [k, v, d] of arg1) {
        if (!types[typeName]) types[typeName] = { [k]: v };
        else types[typeName][k] = v;
        if (d) {
            if (!descriptions[typeName]) descriptions[typeName] = { [k]: d };
            else descriptions[typeName][k] = d;
        }
    }
}

interface Context { }

export function registerResolver(
    typeName: string, key: string, value: string,
    func: (args: any, ctx: Context, info: any) => any,
    description?: string,
) {
    registerValue(typeName, key, value, description);
    const wrappedFunc = async (arg, ctx, info) => {
        const res = await func(arg, ctx, info);
        if (typeof res !== 'object' || res === null) return res;
        const node = value.includes('!') ? value.split('!')[0] : value;
        if (handlers[node]) Object.assign(res, handlers[node]);
        ctx.parent = res;
        return res;
    };
    if (handlers[typeName]) handlers[typeName][key.split('(')[0].trim()] = wrappedFunc;
    else handlers[typeName] = { [key.split('(')[0].trim()]: wrappedFunc };
}

export function registerUnion(typeName: string, ...unionTypes: string[]) {
    unions[typeName] = unionTypes.join(' | ');
}

function setDescription(desc: string) {
    if (desc.includes('\n')) return ['"""', desc, '"""'].join('\n');
    return JSON.stringify(desc);
}

bus.on('app/started', () => {
    let schemaStr = '';

    try {
        const defs = [
            ...Object.keys(unions).map((i) => `union ${i} = ${unions[i]}`),
            ...typeDefs,
            ...Object.keys(types).map((key) => {
                let def = '';
                if (descriptions[key]?._description) def += `${setDescription(descriptions[key]._description)}\n`;
                def += `type ${key}{\n`;
                for (const k in types[key]) {
                    if (descriptions[key]?.[k]) def += `  ${setDescription(descriptions[key][k])}\n`;
                    def += `  ${k}: ${types[key][k]}\n`;
                }
                def += '}\n';
                return def;
            }),
        ];
        schemaStr = defs.join('\n');
    } catch (e) {
        console.error(e);
    }

    const server = new ApolloServer({
        typeDefs: gql(schemaStr),
        resolvers: handlers,
        csrfPrevention: true,
    });

    server.listen().then(({ url }) => {
        console.log(`🚀  Server ready at ${url}`);
    });
});