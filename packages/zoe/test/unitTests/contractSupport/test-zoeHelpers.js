/* eslint-disable */
// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import makeStore from '@agoric/store';
import { setup } from '../setupBasicMints';

import {
  defaultAcceptanceMsg,
  satisfies, trade,
} from '../../../src/contractSupport';
import {assert, details} from "@agoric/assert";
import {makeZcfSeatAdminKit} from "../../../src/contractFacet/seat";
import {isOfferSafe} from "../../../src/contractFacet/offerSafety";

test('ZoeHelpers messages', t => {
    t.is(
      defaultAcceptanceMsg,
      `The offer has been accepted. Once the contract has been completed, please check your payout`,
    );
});

function makeMockTradingZcfBuilder() {
  const offers = makeStore('offerHandle');
  const allocs = makeStore('offerHandle');
  let instanceRecord;
  const amountMathToBrand = makeStore('amountMath');
  const reallocatedStagings = [];
  let isOfferActive = true;

  return harden({
    addOffer: (keyword, offer) => offers.init(keyword, offer),
    addAllocation: (keyword, alloc) => allocs.init(keyword, alloc),
    setInstanceRecord: newRecord => (instanceRecord = newRecord),
    addBrand: issuerRecord =>
      amountMathToBrand.init(issuerRecord.brand, issuerRecord.amountMath),
    setOffersInactive: () => (isOfferActive = false),
    build: () =>
      harden({
        getAmountMath: amountMath => amountMathToBrand.get(amountMath),
        getZoeService: () => {},
        reallocate: (...seatStagings) => {
          reallocatedStagings.push(...seatStagings);
        },
        getReallocatedStagings: () => reallocatedStagings,
      }),
  });
}

test.skip('ZoeHelpers assertKeywords', t => {
  t.plan(5);
  const { moolaR, simoleanR } = setup();
    const mockZCFBuilder = makeMockTradingZcfBuilder();
    mockZCFBuilder.setInstanceRecord({
      issuerKeywordRecord: {
        Asset: moolaR.issuer,
        Price: simoleanR.issuer,
      },
    });

    const mockZCF = mockZCFBuilder.build();
    const { assertKeywords } = makeZoeHelpers(mockZCF);
    t.doesNotThrow(
      () => assertKeywords(['Asset', 'Price']),
      `Asset and Price are the correct keywords`,
    );
    t.doesNotThrow(
      () => assertKeywords(['Price', 'Asset']),
      `Order doesn't matter`,
    );
    t.throws(
      () => assertKeywords(['TokenA', 'TokenB']),
      /were not as expected/,
      `The wrong keywords will throw`,
    );
    t.throws(
      () => assertKeywords(['Asset', 'Price', 'Price2']),
      /were not as expected/,
      `An extra keyword will throw`,
    );
    t.throws(
      () => assertKeywords(['Asset']),
      /were not as expected/,
      `a missing keyword will throw`,
    );
});

test.skip('ZoeHelpers swap ok', t => {
  t.plan(4);
  const { moolaR, simoleanR, moola, simoleans } = setup();
  const leftOfferHandle = harden({});
  const rightOfferHandle = harden({});
  const cantTradeRightOfferHandle = harden({});
    const mockZCFBuilder = makeMockTradingZcfBuilder();
    mockZCFBuilder.addBrand(moolaR);
    mockZCFBuilder.addBrand(simoleanR);
    mockZCFBuilder.addAllocation(leftOfferHandle, { Asset: moola(10) });
    mockZCFBuilder.addAllocation(rightOfferHandle, { Price: simoleans(6) });
    mockZCFBuilder.addAllocation(cantTradeRightOfferHandle, {
      Price: simoleans(6),
    });
    mockZCFBuilder.addOffer(leftOfferHandle, {
      proposal: {
        give: { Asset: moola(10) },
        want: { Price: simoleans(4) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(rightOfferHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(7) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(cantTradeRightOfferHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(100) },
        exit: { onDemand: null },
      },
    });
    const mockZCF = mockZCFBuilder.build();
    const { swap } = makeZoeHelpers(mockZCF);
    t.truthy(
      swap(
        leftOfferHandle,
        rightOfferHandle,
        'prior offer no longer available',
      ),
    );
    t.deepEqual(
      mockZCF.getReallocatedHandles(),
      harden([leftOfferHandle, rightOfferHandle]),
      `both handles reallocated`,
    );
    t.deepEqual(
      mockZCF.getReallocatedAmountObjs(),
      [
        { Asset: moola(3), Price: simoleans(4) },
        { Price: simoleans(2), Asset: moola(7) },
      ],
      `amounts reallocated passed to reallocate were as expected`,
    );
    t.deepEqual(
      mockZCF.getCompletedHandles(),
      harden([leftOfferHandle, rightOfferHandle]),
      `both handles were completed`,
    );
});

test.skip('ZoeHelpers swap keep inactive', t => {
  t.plan(4);
  const { moola, simoleans } = setup();
  const leftOfferHandle = harden({});
  const rightOfferHandle = harden({});
  const cantTradeRightOfferHandle = harden({});
    const mockZCFBuilder = makeMockTradingZcfBuilder();
    mockZCFBuilder.addOffer(leftOfferHandle, {
      proposal: {
        give: { Asset: moola(10) },
        want: { Price: simoleans(4) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(rightOfferHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(7) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(cantTradeRightOfferHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(100) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.setOffersInactive();
    const mockZCF = mockZCFBuilder.build();
    const { swap } = makeZoeHelpers(mockZCF);
    t.throws(
      () =>
        swap(
          leftOfferHandle,
          rightOfferHandle,
          'prior offer no longer available',
        ),
      /Error: prior offer no longer available/,
      `throws if keepHandle offer is not active`,
    );
    const reallocatedHandles = mockZCF.getReallocatedHandles();
    t.deepEqual(reallocatedHandles, harden([]), `nothing reallocated`);
    const reallocatedAmountObjs = mockZCF.getReallocatedAmountObjs();
    t.deepEqual(reallocatedAmountObjs, harden([]), `no amounts reallocated`);
    t.deepEqual(
      mockZCF.getCompletedHandles(),
      harden([]),
      `no offers were completed`,
    );
});

test.skip(`ZoeHelpers swap - can't trade with`, t => {
  t.plan(4);
  const { moolaR, simoleanR, moola, simoleans } = setup();
  const leftOfferHandle = harden({});
  const rightOfferHandle = harden({});
  const cantTradeHandle = harden({});

    const mockZCFBuilder = makeMockTradingZcfBuilder();
    mockZCFBuilder.addBrand(moolaR);
    mockZCFBuilder.addBrand(simoleanR);
    mockZCFBuilder.addOffer(leftOfferHandle, {
      proposal: {
        give: { Asset: moola(10) },
        want: { Price: simoleans(4) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(rightOfferHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(7) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addOffer(cantTradeHandle, {
      proposal: {
        give: { Price: simoleans(6) },
        want: { Asset: moola(100) },
        exit: { onDemand: null },
      },
    });
    mockZCFBuilder.addAllocation(leftOfferHandle, { Asset: moola(10) });
    mockZCFBuilder.addAllocation(rightOfferHandle, { Price: simoleans(6) });
    mockZCFBuilder.addAllocation(cantTradeHandle, { Price: simoleans(6) });
    const mockZcf = mockZCFBuilder.build();
    const { swap } = makeZoeHelpers(mockZcf);
    t.throws(
      () =>
        swap(
          leftOfferHandle,
          cantTradeHandle,
          'prior offer no longer available',
        ),
      /Error: The offer was invalid. Please check your refund./,
      `throws if can't trade with left and right`,
    );
    const reallocatedHandles = mockZcf.getReallocatedHandles();
    t.deepEqual(reallocatedHandles, harden([]), `nothing reallocated`);
    const reallocatedAmountObjs = mockZcf.getReallocatedAmountObjs();
    t.deepEqual(reallocatedAmountObjs, harden([]), `no amounts reallocated`);
    const completedHandles = mockZcf.getCompletedHandles();
    t.deepEqual(completedHandles, harden([]), `no offers were completed`);
});

test.skip('ZoeHelpers isOfferSafe', t => {
  t.plan(5);
  const { moolaR, simoleanR, moola, simoleans } = setup();
  const leftOfferHandle = harden({});
  const rightOfferHandle = harden({});
  const cantTradeRightOfferHandle = harden({});
  const reallocatedHandles = [];
  const reallocatedAmountObjs = [];
  const completedHandles = [];
    const mockZCFBuilder = makeMockTradingZcfBuilder();
    mockZCFBuilder.addBrand(moolaR);
    mockZCFBuilder.addBrand(simoleanR);
    mockZCFBuilder.addAllocation(leftOfferHandle, { Asset: moola(10) });
    mockZCFBuilder.addAllocation(rightOfferHandle, { Price: simoleans(6) });
    mockZCFBuilder.addAllocation(cantTradeRightOfferHandle, {
      Price: simoleans(6),
    });
    mockZCFBuilder.addOffer(leftOfferHandle, {
      proposal: {
        give: { Asset: moola(10) },
        want: { Price: simoleans(4) },
        exit: { onDemand: null },
      },
    });
    const mockZCF = mockZCFBuilder.build();
    const { isOfferSafe } = makeZoeHelpers(mockZCF);
    t.truthy(
      isOfferSafe(leftOfferHandle, {
        Asset: moola(0),
        Price: simoleans(4),
      }),
      `giving someone exactly what they want is offer safe`,
    );
    t.falsy(
      isOfferSafe(leftOfferHandle, {
        Asset: moola(0),
        Price: simoleans(3),
      }),
      `giving someone less than what they want and not what they gave is not offer safe`,
    );
    t.deepEqual(reallocatedHandles, harden([]), `nothing reallocated`);
    t.deepEqual(reallocatedAmountObjs, harden([]), `no amounts reallocated`);
    t.deepEqual(completedHandles, harden([]), `no offers completed`);
});

test('ZoeHelpers satisfies blank proposal', t => {
  const { moolaR, moola } = setup();
  const fakeZcfSeat = harden({
    getCurrentAllocation: () => harden({ Asset: moola(10) }),
    getProposal: () => harden({}),
  });
  const mockZCFBuilder = makeMockTradingZcfBuilder();
  mockZCFBuilder.addBrand(moolaR);
  const mockZCF = mockZCFBuilder.build();
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Gift: moola(3) }),
    `giving anything to a blank proposal is satisifying`,
  );
});

test('ZoeHelpers satisfies simple proposal', t => {
  const { moolaR, moola, simoleans } = setup();
  const fakeZcfSeat = harden({
    getCurrentAllocation: () => harden({ Asset: moola(10) }),
    getProposal: () => harden({ want: { Desire: moola(30) } }),
  });
  const mockZCFBuilder = makeMockTradingZcfBuilder();
  mockZCFBuilder.addBrand(moolaR);
  const mockZCF = mockZCFBuilder.build();
  t.falsy(
    satisfies(mockZCF, fakeZcfSeat, { Desire: moola(3) }),
    `giving less than specified to a proposal is not satisifying`,
  );
  t.falsy(
    satisfies(mockZCF, fakeZcfSeat, { Gift: moola(3) }),
    `giving other than what's specified to a proposal is not satisifying`,
  );
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Desire: moola(30) }),
    `giving exactly what's proposed is satisifying`,
  );
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Desire: moola(30), Gift: simoleans(1) }),
    `giving extras beyond what's proposed is satisifying`,
  );
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Desire: moola(40) }),
    `giving more than what's proposed is satisifying`,
  );
});

test('ZoeHelpers satisfies() with give', t => {
  const { moolaR, moola, bucks, bucksR, simoleans, simoleanR } = setup();
  const fakeZcfSeat = harden({
    getCurrentAllocation: () => harden({ Charge: moola(30) }),
    getProposal: () => harden({ give: { Charge: moola(30) }, want: { Desire: bucks(5) } }),
  });
  const mockZCFBuilder = makeMockTradingZcfBuilder();
  mockZCFBuilder.addBrand(moolaR);
  mockZCFBuilder.addBrand(bucksR);
  mockZCFBuilder.addBrand(simoleanR);
  const mockZCF = mockZCFBuilder.build();
  t.falsy(
    satisfies(mockZCF, fakeZcfSeat, { Charge: moola(0), Desire: bucks(1) }),
    `giving neither give nor want to a proposal is not satisifying`,
  );
  t.falsy(
    satisfies(mockZCF, fakeZcfSeat, { Charge: moola(3) }),
    `giving less than what's specified to a proposal is not satisifying`,
  );
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Charge: moola(0), Desire: bucks(40) }),
    `giving more than what's wanted is satisifying`,
  );
  t.truthy(
    satisfies(mockZCF, fakeZcfSeat, { Desire: bucks(40), Charge: moola(3) } ),
    `giving what's wanted makes it possible to reduce give`,
  );
});

const makeMockZcfSeatAdmin = (proposal, initialAllocation, getAmountMath) => {
  let exited = false;
  const allSeatStagings = new WeakSet();
  const assertExitedFalse = () =>
    assert(!exited, details`seat has been exited`);

  let zoeSeatAdminExitCalled = false;
  let zoeSeatAdminKickoutCalled = false;
  const mockZoeSeatAdmin = harden({
    exit: () => zoeSeatAdminExitCalled = true,
    kickOut: () => zoeSeatAdminKickoutCalled = true,
  });
  const { zcfSeat: actual } = makeZcfSeatAdminKit(
    allSeatStagings,
    mockZoeSeatAdmin,
    { proposal, initialAllocation},
    getAmountMath,
  );
  const mockSeat = harden({
    isOfferSafe: actual.isOfferSafe,
    getCurrentAllocation: actual.getCurrentAllocation,
    getProposal: () => proposal,
    stage: actual.stage,
    hasExited: actual.hasExited,
  });
  return mockSeat;
}

test('ZoeHelpers trade ok', t => {
  const { moolaR, simoleanR, moola, simoleans, amountMaths, brands } = setup();
  const getAmountMath =
      brand => amountMaths.get(brand.getAllegedName());
  const leftProposal = {
    give: { Asset: moola(10) },
    want: { Bid: simoleans(4) },
    exit: { onDemand: null },
  }
  const leftAlloc = { Asset: moola(10) };
  const leftZcfSeat = makeMockZcfSeatAdmin(leftProposal, leftAlloc, getAmountMath);
  const rightProposal = {
    give: { Money: simoleans(6) },
    want: { Items: moola(7) },
    exit: { onDemand: null },
  }

  const rightAlloc = { Money: simoleans(6) };
  const rightZcfSeat = makeMockZcfSeatAdmin(rightProposal, rightAlloc, getAmountMath);
  const mockZCFBuilder = makeMockTradingZcfBuilder();
  mockZCFBuilder.addBrand(moolaR);
  mockZCFBuilder.addBrand(simoleanR);
  const mockZCF = mockZCFBuilder.build();
  t.notThrows(
    () =>
      trade(
        mockZCF,
        {
          seat: leftZcfSeat,
          gains: { Bid: simoleans(4) },
          losses: { Asset: moola(7) },
        },
        {
          seat: rightZcfSeat,
          gains: { Items: moola(7) },
          losses: { Money: simoleans(4) },
        },
      ));
  t.deepEqual(mockZCF.getReallocatedStagings().length, 2, `both reallocated`);
  t.deepEqual(
    mockZCF.getReallocatedStagings()[0].getStagedAllocation(),
    { Asset: moola(3), Bid: simoleans(4) },
    'left gets what she wants',
  );
  t.deepEqual(
    mockZCF.getReallocatedStagings()[1].getStagedAllocation(),
    { Items: moola(7), Money: simoleans(2) },
    'right gets what he wants',
  );
});

test('ZoeHelpers trade sameHandle', t => {
  const { moolaR, simoleanR, moola, simoleans, amountMaths, brands } = setup();
  const getAmountMath =
      brand => amountMaths.get(brand.getAllegedName());
  const leftProposal = {
    give: { Asset: moola(10) },
    want: { Bid: simoleans(4) },
    exit: { onDemand: null },
  }
  const leftAlloc = { Asset: moola(10) };
  const leftZcfSeat = makeMockZcfSeatAdmin(leftProposal, leftAlloc, getAmountMath);

  const mockZCFBuilder = makeMockTradingZcfBuilder();
  mockZCFBuilder.addBrand(moolaR);
  mockZCFBuilder.addBrand(simoleanR);
  const mockZCF = mockZCFBuilder.build();
  t.throws(
    () =>
      trade(
        mockZCF,
        {
          seat: leftZcfSeat,
          gains: { Bid: simoleans(4) },
          losses: { Asset: moola(7) },
        },
        {
          seat: leftZcfSeat,
          gains: { Items: moola(7) },
          losses: { Money: simoleans(4) },
        },
      ),
    { message: 'a seat cannot trade with itself'},
    'seats must be different',
    );
});
