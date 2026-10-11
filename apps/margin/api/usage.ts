import { getUsageFor, resolveUser } from './_usage';

// Returns the caller's current usage so the client can render the usage badge
// and the limit-reached notice.
export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const { userId, authed } = await resolveUser(req);
        const usage = await getUsageFor(userId, authed);
        return res.status(200).json(usage);
    } catch (error: any) {
        console.error('Usage API Error:', error);
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
