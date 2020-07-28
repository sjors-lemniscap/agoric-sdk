// @ts-check

/**
 * This is a very trivial contract to explain and test Zoe.
 * AutomaticRefund just gives you back what you put in.
 * AutomaticRefund tells Zoe to complete the
 * offer, which gives the user their payout through Zoe. Other
 * contracts will use these same steps, but they will have more
 * sophisticated logic and interfaces.
 *
 * Since the contract doesn't attempt any reallocation, the offer can contain
 * anything in `give` and `want`. The amount in `give` will be returned, and
 * `want` will be ignored.
 *
 * @typedef {import('../zoe').ContractFacet} ContractFacet
 * @param {ContractFacet} zcf
 */
const execute = (zcf, _terms) => {
  let offersCount = 0;

  const refund = seat => {
    offersCount += 1;
    seat.exit();
    return `The offer was accepted`;
  };

  const admin = harden({
    makeRefundInvite: () => zcf.makeInvitation(refund, 'getRefund'),
    getOffersCount: () => offersCount,
  });

  return admin;
};

harden(execute);
export { execute };
