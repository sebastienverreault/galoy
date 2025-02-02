import { SAT_USDCENT_PRICE, USER_PRICE_UPDATE_EVENT } from "@config"
import { toSats } from "@domain/bitcoin"
import { lnPaymentStatusEvent } from "@domain/bitcoin/lightning"
import { NotImplementedError } from "@domain/errors"
import {
  accountUpdateEvent,
  NotificationsServiceError,
  NotificationType,
} from "@domain/notifications"
import { WalletCurrency } from "@domain/shared"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@services/mongoose"
import pubsub from "@services/pubsub"

import { sendNotification } from "./notification"
import { transactionBitcoinNotification, transactionUsdNotification } from "./payment"

export const NotificationsService = (logger: Logger): INotificationsService => {
  const sendOnChainNotification = async ({
    type,
    sats,
    walletId,
    txHash,
    displayCurrencyPerSat,
  }: {
    type: NotificationType
    walletId: WalletId
    sats: Satoshis
    txHash: OnChainTxHash
    displayCurrencyPerSat?: DisplayCurrencyPerSat
  }): Promise<void | NotificationsServiceError> => {
    // FIXME: this try/catch is probably a no-op
    // because the error would not be awaited if they arise
    // see if this is safe to delete
    try {
      const wallet = await WalletsRepository().findById(walletId)
      if (wallet instanceof Error) throw wallet

      const account = await AccountsRepository().findById(wallet.accountId)
      if (account instanceof Error) return account

      const user = await UsersRepository().findById(account.ownerId)
      if (user instanceof Error) return user

      // Do not await this call for quicker processing
      transactionBitcoinNotification({
        type,
        user,
        logger,
        sats,
        txHash,
        displayCurrencyPerSat,
      })

      // Notify the recipient (via GraphQL subscription if any)
      const accountUpdatedEventName = accountUpdateEvent(account.id)

      pubsub.publish(accountUpdatedEventName, {
        transaction: {
          walletId,
          txNotificationType: type,
          amount: sats,
          txHash,
          displayCurrencyPerSat,
        },
      })
      return
    } catch (err) {
      return new NotificationsServiceError(err)
    }
  }

  const onChainTransactionReceived = async ({
    amount,
    walletId,
    txHash,
    displayCurrencyPerSat,
  }: OnChainTxReceivedArgs) =>
    sendOnChainNotification({
      type: NotificationType.OnchainReceipt,
      sats: amount,
      walletId,
      txHash,
      displayCurrencyPerSat,
    })

  const onChainTransactionReceivedPending = async ({
    amount,
    walletId,
    txHash,
    displayCurrencyPerSat,
  }: OnChainTxReceivedPendingArgs) =>
    sendOnChainNotification({
      type: NotificationType.OnchainReceiptPending,
      sats: amount,
      walletId,
      txHash,
      displayCurrencyPerSat,
    })

  const onChainTransactionPayment = async ({
    amount,
    walletId,
    txHash,
    displayCurrencyPerSat,
  }: OnChainTxPaymentArgs) =>
    sendOnChainNotification({
      type: NotificationType.OnchainPayment,
      sats: amount,
      walletId,
      txHash,
      displayCurrencyPerSat,
    })

  const lnInvoiceBitcoinWalletPaid = async ({
    paymentHash,
    recipientWalletId,
    sats,
    displayCurrencyPerSat,
  }: LnInvoicePaidBitcoinWalletArgs) => {
    try {
      const wallet = await WalletsRepository().findById(recipientWalletId)
      if (wallet instanceof Error) throw wallet

      const account = await AccountsRepository().findById(wallet.accountId)
      if (account instanceof Error) return account

      const user = await UsersRepository().findById(account.ownerId)
      if (user instanceof Error) return user

      // Do not await this call for quicker processing
      transactionBitcoinNotification({
        type: NotificationType.LnInvoicePaid,
        user,
        logger,
        sats,
        paymentHash,
        displayCurrencyPerSat,
      })

      // Notify public subscribers (via GraphQL subscription if any)
      const eventName = lnPaymentStatusEvent(paymentHash)
      pubsub.publish(eventName, { status: "PAID" })

      // Notify the recipient (via GraphQL subscription if any)
      const accountUpdatedEventName = accountUpdateEvent(account.id)
      pubsub.publish(accountUpdatedEventName, {
        invoice: {
          walletId: recipientWalletId,
          paymentHash,
          status: "PAID",
        },
      })
      return
    } catch (err) {
      return new NotificationsServiceError(err)
    }
  }

  const lnInvoiceUsdWalletPaid = async ({
    paymentHash,
    recipientWalletId,
    cents,
    displayCurrencyPerSat,
  }: LnInvoicePaidUsdWalletArgs) => {
    try {
      const wallet = await WalletsRepository().findById(recipientWalletId)
      if (wallet instanceof Error) throw wallet

      const account = await AccountsRepository().findById(wallet.accountId)
      if (account instanceof Error) return account

      const user = await UsersRepository().findById(account.ownerId)
      if (user instanceof Error) return user

      // Do not await this call for quicker processing
      transactionUsdNotification({
        type: NotificationType.LnInvoicePaid,
        user,
        logger,
        cents,
        paymentHash,
        displayCurrencyPerSat,
      })

      // Notify public subscribers (via GraphQL subscription if any)
      const eventName = lnPaymentStatusEvent(paymentHash)
      pubsub.publish(eventName, { status: "PAID" })

      // Notify the recipient (via GraphQL subscription if any)
      const accountUpdatedEventName = accountUpdateEvent(account.id)
      pubsub.publish(accountUpdatedEventName, {
        invoice: {
          walletId: recipientWalletId,
          paymentHash,
          status: "PAID",
        },
      })
      return
    } catch (err) {
      return new NotificationsServiceError(err)
    }
  }

  const priceUpdate = (displayCurrencyPerSat) => {
    pubsub.publish(SAT_USDCENT_PRICE, { satUsdCentPrice: 100 * displayCurrencyPerSat })
    pubsub.publish(USER_PRICE_UPDATE_EVENT, {
      price: { satUsdCentPrice: 100 * displayCurrencyPerSat },
    })
  }

  const intraLedgerPaid = async ({
    senderWalletId,
    recipientWalletId,
    amount,
    displayCurrencyPerSat,
  }: IntraLedgerArgs): Promise<void | NotificationsServiceError> => {
    try {
      const publish = async ({
        walletId,
        type,
      }: {
        walletId: WalletId
        type: NotificationType
      }) => {
        const wallet = await WalletsRepository().findById(senderWalletId)
        if (wallet instanceof Error) return wallet

        const account = await AccountsRepository().findById(wallet.accountId)
        if (account instanceof Error) return account

        // Notify the recipient (via GraphQL subscription if any)
        const accountUpdatedEventName = accountUpdateEvent(account.id)

        pubsub.publish(accountUpdatedEventName, {
          intraLedger: {
            walletId,
            txNotificationType: type,
            amount,
            displayCurrencyPerSat,
          },
        })

        const user = await UsersRepository().findById(account.ownerId)
        if (user instanceof Error) return user

        // Do not await this call for quicker processing
        transactionBitcoinNotification({
          type: NotificationType.IntraLedgerPayment,
          user,
          logger,
          sats: amount,
          displayCurrencyPerSat,
        })
      }

      publish({
        walletId: senderWalletId,
        type: NotificationType.IntraLedgerPayment,
      })

      publish({
        walletId: recipientWalletId,
        type: NotificationType.IntraLedgerReceipt,
      })
    } catch (err) {
      return new NotificationsServiceError(err)
    }
  }

  const sendBalance = async ({
    balance,
    walletCurrency,
    userId,
    price,
  }: {
    balance: CurrencyBaseAmount
    walletCurrency: WalletCurrency
    userId: UserId
    price: DisplayCurrencyPerSat | ApplicationError
  }): Promise<void | NotImplementedError> => {
    if (walletCurrency === WalletCurrency.Usd) {
      return new NotImplementedError("sendBalance works with sats")
    }

    const balanceSats = toSats(balance)

    // Add commas to balancesats
    const balanceSatsAsFormattedString = balanceSats.toLocaleString("en")

    let balanceUsdAsFormattedString: string, title: string
    if (price instanceof Error) {
      logger.warn({ price }, "impossible to fetch price for notification")

      // TODO: i18n
      title = `Your balance is ${balanceSatsAsFormattedString} sats)`
    } else {
      const usdValue = price * balanceSats
      balanceUsdAsFormattedString = usdValue.toLocaleString("en", {
        maximumFractionDigits: 2,
      })

      // TODO: i18n
      title = `Your balance is $${balanceUsdAsFormattedString} (${balanceSatsAsFormattedString} sats)`
    }

    logger.info(
      { balanceSatsAsFormattedString, title, userId },
      `sending balance notification to user`,
    )

    const user = await UsersRepository().findById(userId)
    if (user instanceof Error) {
      logger.warn({ user }, "impossible to fetch user to send transaction")
      return
    }

    await sendNotification({
      user,
      title,
      logger,
    })
  }

  return {
    onChainTransactionReceived,
    onChainTransactionReceivedPending,
    onChainTransactionPayment,
    priceUpdate,
    lnInvoiceBitcoinWalletPaid,
    lnInvoiceUsdWalletPaid,
    intraLedgerPaid,
    sendBalance,
  }
}
