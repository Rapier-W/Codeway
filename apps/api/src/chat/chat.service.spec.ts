import { ChatService } from './chat.service';

describe('ChatService', () => {
  it('returns the winning message when concurrent idempotent writes hit the unique index', async () => {
    const winner = { id: 'm1', tripId: 't1', senderId: 'u1', text: '你好', kind: 'TEXT', createdAt: new Date() };
    const prisma: any = {
      trip: { findUnique: jest.fn().mockResolvedValue({ id: 't1', status: 'FORMED' }) },
      tripMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      chatMessage: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const service = new ChatService(prisma);

    await expect(service.send('t1', 'u1', { text: '你好' }, 'same-key')).resolves.toMatchObject({ id: 'm1', duplicate: true });
  });
});
