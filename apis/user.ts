import crypto from 'crypto';
import { Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import { registerResolver, registerValue } from '../api';
import { db } from '../services';

const collUser: Collection<{ username: string, hash: string, roles: string[], token: string[] }> = db.collection('user');

registerValue('User', [
    ['roles', '[String!]'],
    ['username', 'String!'],
]);
registerResolver('Query', 'currentUser', 'User', async (args, ctx: any) => ctx.currentUser);

registerResolver('Query', 'user', 'UserContext', () => ({}));
registerResolver('UserContext', 'add(username: String!, password: String!, roles: [Role!])', 'String! @auth', async (args) => {
    const hash = crypto.pbkdf2Sync(args.password, args.username, 100000, 64, 'sha256').toString('hex').substr(0, 64);
    const res = await collUser.insertOne({
        username: args.username, hash, roles: args.roles, token: [],
    });
    return res.insertedId;
});
registerResolver('UserContext', 'list', '[User] @auth', async () => await collUser.find({}).project({ username: 1, roles: 1 }).toArray());
registerResolver('UserContext', 'get(username: String!)', 'User', async (args) => await collUser.findOne({ username: args.username }));
registerResolver('UserContext', 'changePassword(password: String!)', 'Boolean! @auth(requires: USER)', async (args, ctx: any) => {
    const hash = crypto.pbkdf2Sync(args.password, ctx.currentUser.username, 100000, 64, 'sha256').toString('hex').substr(0, 64);
    const res = await collUser.updateOne({ _id: ctx.currentUser._id }, { $set: { hash } });
    return !!res.modifiedCount;
});
registerResolver('UserContext', 'update(username: String!, roles: [Role!])', 'Boolean! @auth', async (args, ctx: any) => {
    const res = await collUser.updateOne({ username: args.username }, { $set: { roles: args.roles } });
    return !!res.modifiedCount;
});
registerResolver('UserContext', 'del(username: String!)', 'Boolean! @auth', async (args, ctx: any) => {
    const res = await collUser.deleteOne({ username: args.username });
    return !!res.deletedCount;
});
registerValue('UserAuthResponse', [
    ['token', 'String!'],
    ['username', 'String!'],
    ['roles', '[Role!]'],
]);
registerResolver('UserContext', 'auth(username: String!, password: String!)', 'UserAuthResponse', async (args, ctx: any) => {
    const hash = crypto.pbkdf2Sync(args.password, args.username, 100000, 64, 'sha256').toString('hex').substr(0, 64);
    const token = nanoid();
    const res = await collUser.findOneAndUpdate({ username: args.username, hash }, { $push: { token } });
    ctx.currentUser = res.value;
    return res.value ? { token, username: res.value.username, roles: res.value.roles } : null;
});
registerResolver('UserContext', 'logout', 'Boolean! @auth(requires: USER)', async (args) => {
    const res = await collUser.updateOne({ _id: args.currentUser._id }, { $pull: { token: args.currentUser.token } });
    return !!res.modifiedCount;
});
registerResolver('UserContext', 'count', 'Int!', async (args) => await collUser.countDocuments());

collUser.createIndex({ username: 1 }, { unique: true });
