import { nanoid } from 'nanoid';
import { registerResolver, registerValue } from '../api';
import { bucket, minio } from '../services';

registerResolver('Query', 'file', 'FileContext', () => ({}));
registerValue('RequestUploadResponse', [
    ['postURL', 'String!'],
    ['formData', 'JSON!'],
]);
registerResolver('FileContext', 'requestUpload(size: Int!, ext: String!)', 'RequestUploadResponse @auth', async (args) => {
    const target = nanoid();
    if (!/[a-z0-9]+/.test(args.ext)) throw new Error('invalid ext');
    const policy = minio.newPostPolicy();
    policy.setBucket(bucket);
    policy.setKey(`${target}.${args.ext}`);
    policy.setExpires(new Date(Date.now() + 30 * 60 * 1000));
    policy.setContentLengthRange(Math.max(args.size - 50, 1), args.size + 50);
    return await minio.presignedPostPolicy(policy);
});
registerResolver('FileContext', 'del(filename: String!)', 'Boolean! @auth', async (args) => {
    await minio.removeObject(bucket, args.filename);
    return true;
});
