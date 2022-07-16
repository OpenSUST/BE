import { registerResolver } from '../api';

registerResolver('Query', 'ping', 'String', () => 'pong');
