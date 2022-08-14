import { makeExecutableSchema } from '@graphql-tools/schema';
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import { ApolloServer } from 'apollo-server';
import { defaultFieldResolver } from 'graphql';
import { resolvers as scalarResolvers, typeDefs } from 'graphql-scalars';
import * as bus from './bus';
import { port } from './config';
import { db } from './services';

const coll = db.collection('user');

const types: Record<string, Record<string, string>> = {};
const unions: Record<string, string> = {};
const descriptions: Record<string, Record<string, string>> = {};
const handlers: Record<string, Record<string, any>> = {
    ...scalarResolvers,
    Query: {},
    Mutation: {},
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
    if (typeName === 'Query') registerValue('Mutation', key, value, description);
    const wrappedFunc = async (_, arg, ctx, info) => {
        const res = await func(arg, ctx, info);
        if (typeof res !== 'object' || res === null) return res;
        const node = value.includes('!') ? value.split('!')[0] : value;
        if (handlers[node]) Object.assign(res, handlers[node]);
        ctx.parent = res;
        return res;
    };
    if (handlers[typeName]) handlers[typeName][key.split('(')[0].trim()] = wrappedFunc;
    else handlers[typeName] = { [key.split('(')[0].trim()]: wrappedFunc };
    if (typeName === 'Query') {
        if (handlers.Mutation) handlers.Mutation[key.split('(')[0].trim()] = wrappedFunc;
        else handlers.Mutation = { [key.split('(')[0].trim()]: wrappedFunc };
    }
}

export function registerUnion(typeName: string, ...unionTypes: string[]) {
    unions[typeName] = unionTypes.join(' | ');
}

function setDescription(desc: string) {
    if (desc.includes('\n')) return ['"""', desc, '"""'].join('\n');
    return JSON.stringify(desc);
}

function getUser(user: any) {
    return {
        hasRole: (role: string) => {
            if (!user) return role === 'GUEST';
            return user.roles.includes(role);
        },
    };
}
const typeDirectiveArgumentMaps: Record<string, any> = {};

bus.on('app/started', () => {
    const defs = [
        ...Object.keys(unions).map((i) => `union ${i} = ${unions[i]}`),
        /* GraphQL */ `
            directive @auth(requires: Role = ADMIN) on OBJECT | FIELD_DEFINITION
            enum Role {
                ADMIN
                USER
                GUEST
            }
            `,
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

    const schema = makeExecutableSchema({ typeDefs: defs, resolvers: handlers });
    const server = new ApolloServer({
        schema: mapSchema(schema, {
            [MapperKind.TYPE]: (type) => {
                const authDirective = getDirective(schema, type, 'auth')?.[0];
                if (authDirective) {
                    typeDirectiveArgumentMaps[type.name] = authDirective;
                }
                return undefined;
            },
            [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
                const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0] ?? typeDirectiveArgumentMaps[typeName];
                if (authDirective) {
                    const { requires } = authDirective;
                    if (requires) {
                        const { resolve = defaultFieldResolver } = fieldConfig;
                        fieldConfig.resolve = function (source, args, context, info) {
                            const user = getUser(context.currentUser);
                            if (!user.hasRole(requires)) throw new Error('not authorized');
                            return resolve(source, args, context, info);
                        };
                        return fieldConfig;
                    }
                }
            },
        }),
        csrfPrevention: true,
        debug: true,
        context: async ({ req }) => ({
            currentUser: await coll.findOne({ token: req.headers.authorization }),
        }),
    });

    server.listen(port, '0.0.0.0').then(({ url }) => {
        console.log(`🚀  Server ready at ${url}`);
    });
});
