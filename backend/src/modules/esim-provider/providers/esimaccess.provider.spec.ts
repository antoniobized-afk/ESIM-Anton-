import { EsimAccessProvider } from './esimaccess.provider';

function mockProviderClient(provider: EsimAccessProvider) {
  const providerWithClient = provider as unknown as {
    client: { post: jest.Mock };
  };
  providerWithClient.client.post = jest.fn();

  return providerWithClient.client.post;
}

describe('EsimAccessProvider.getPackages', () => {
  it('маппит unusedValidTime в validity для daily-тарифов и не подменяет его duration', async () => {
    const provider = new EsimAccessProvider('access-code', 'secret-key');
    const post = mockProviderClient(provider);
    post.mockResolvedValue({
      data: {
        success: true,
        obj: {
          packageList: [
            {
              packageCode: 'TH_1_Daily',
              name: 'Thailand 1GB/Day FUP1Mbps',
              slug: 'TH_1_Daily',
              location: 'Thailand',
              locationCode: 'TH',
              price: 20000,
              currencyCode: 'USD',
              volume: 1073741824,
              smsVolume: 0,
              unusedValidTime: 180,
              duration: 1,
              durationUnit: 'DAY',
              supportTopUpType: 3,
              dataType: 2,
              fupPolicy: '1Mbps',
              locationNetworkList: [],
            },
          ],
        },
      },
    });

    const [pkg] = await provider.getPackages(undefined, 2);

    expect(pkg.validity).toBe(180);
    expect(pkg.unusedValidTime).toBe(180);
    expect(pkg.duration).toBe(1);
    expect(pkg.dataType).toBe(2);
  });
});
