import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useState } from 'react'
import { client } from '../apollo/client'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useTimeframe } from './Application'
import { timeframeOptions } from '../constants'
import { getPercentChange, getBlockFromTimestamp, getBlocksFromTimestamps, get2DayPercentChange } from '../helpers'
import { GLOBAL_DATA, GLOBAL_TXNS, GLOBAL_CHART, ETH_PRICE, ALL_PAIRS, ALL_TOKENS } from '../apollo/queries'
import weekOfYear from 'dayjs/plugin/weekOfYear'

const UPDATE = 'UPDATE'
const UPDATE_TXNS = 'UPDATE_TXNS'
const UPDATE_CHART = 'UPDATE_CHART'
const UPDATE_ETH_PRICE = 'UPDATE_ETH_PRICE'
const ETH_PRICE_KEY = 'ETH_PRICE_KEY'
const UPDATE_ALL_PAIRS_IN_EMISWAP = 'UPDAUPDATE_ALL_PAIRS_IN_EMISWAPTE_TOP_PAIRS'
const UPDATE_ALL_TOKENS_IN_EMISWAP = 'UPDATE_ALL_TOKENS_IN_EMISWAP'

dayjs.extend(utc)
dayjs.extend(weekOfYear)

const GlobalDataContext = createContext()

function useGlobalDataContext() {
  return useContext(GlobalDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { data } = payload
      return {
        ...state,
        globalData: data
      }
    }
    case UPDATE_TXNS: {
      const { transactions } = payload
      return {
        ...state,
        transactions
      }
    }
    case UPDATE_CHART: {
      const { daily, weekly } = payload
      return {
        ...state,
        chartData: {
          daily,
          weekly
        }
      }
    }
    case UPDATE_ETH_PRICE: {
      const { ethPrice, oneDayPrice, ethPriceChange } = payload
      return {
        [ETH_PRICE_KEY]: ethPrice,
        oneDayPrice,
        ethPriceChange
      }
    }

    case UPDATE_ALL_PAIRS_IN_EMISWAP: {
      const { allPairs } = payload
      return {
        ...state,
        allPairs
      }
    }

    case UPDATE_ALL_TOKENS_IN_EMISWAP: {
      const { allTokens } = payload
      return {
        ...state,
        allTokens
      }
    }
    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback(data => {
    dispatch({
      type: UPDATE,
      payload: {
        data
      }
    })
  }, [])

  const updateTransactions = useCallback(transactions => {
    dispatch({
      type: UPDATE_TXNS,
      payload: {
        transactions
      }
    })
  }, [])

  const updateChart = useCallback((daily, weekly) => {
    dispatch({
      type: UPDATE_CHART,
      payload: {
        daily,
        weekly
      }
    })
  }, [])

  const updateEthPrice = useCallback((ethPrice, oneDayPrice, ethPriceChange) => {
    dispatch({
      type: UPDATE_ETH_PRICE,
      payload: {
        ethPrice,
        oneDayPrice,
        ethPriceChange
      }
    })
  }, [])

  const updateAllPairsInEmiswap = useCallback(allPairs => {
    dispatch({
      type: UPDATE_ALL_PAIRS_IN_EMISWAP,
      payload: {
        allPairs
      }
    })
  }, [])

  const updateAllTokensInEmiswap = useCallback(allTokens => {
    dispatch({
      type: UPDATE_ALL_TOKENS_IN_EMISWAP,
      payload: {
        allTokens
      }
    })
  }, [])
  return (
    <GlobalDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateTransactions,
            updateChart,
            updateEthPrice,
            updateAllPairsInEmiswap,
            updateAllTokensInEmiswap
          }
        ],
        [
          state,
          update,
          updateTransactions,
          updateChart,
          updateEthPrice,
          updateAllPairsInEmiswap,
          updateAllTokensInEmiswap
        ]
      )}
    >
      {children}
    </GlobalDataContext.Provider>
  )
}

async function getGlobalData(ethPrice, oldEthPrice) {
  let data = {}
  let oneDayData = {}
  let twoDayData = {}
  try {
    const utcCurrentTime = dayjs()
    const utcOneDayBack = utcCurrentTime
      .subtract(1, 'day')
      .startOf('minute')
      .unix()
    const utcTwoDaysBack = utcCurrentTime
      .subtract(2, 'day')
      .startOf('minute')
      .unix()
    let [oneDayBlock, twoDayBlock] = await getBlocksFromTimestamps([utcOneDayBack, utcTwoDaysBack])

    let result = await client.query({
      query: GLOBAL_DATA(),
      fetchPolicy: 'cache-first'
    })
    data = result.data.emiswapFactories[0]
    let oneDayResult = await client.query({
      query: GLOBAL_DATA(oneDayBlock?.number),
      fetchPolicy: 'cache-first'
    })
    oneDayData = oneDayResult.data.emiswapFactories[0]

    let twoDayResult = await client.query({
      query: GLOBAL_DATA(twoDayBlock?.number),
      fetchPolicy: 'cache-first'
    })
    twoDayData = twoDayResult.data.emiswapFactories[0]

    if (data && oneDayData && twoDayData) {
      let [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
        data.totalVolumeUSD,
        oneDayData.totalVolumeUSD ? oneDayData.totalVolumeUSD : 0,
        twoDayData.totalVolumeUSD ? twoDayData.totalVolumeUSD : 0
      )

      const [oneDayVolumeETH, volumeChangeETH] = get2DayPercentChange(
        data.totalVolumeETH,
        oneDayData.totalVolumeETH ? oneDayData.totalVolumeETH : 0,
        twoDayData.totalVolumeETH ? twoDayData.totalVolumeETH : 0
      )

      const [oneDayTxns, txnChange] = get2DayPercentChange(
        data.txCount,
        oneDayData.txCount ? oneDayData.txCount : 0,
        twoDayData.txCount ? twoDayData.txCount : 0
      )

      data.totalLiquidityUSD = data.totalLiquidityETH * ethPrice

      const liquidityChangeUSD = getPercentChange(
        data.totalLiquidityETH * ethPrice,
        oneDayData.totalLiquidityETH * oldEthPrice
      )
      data.oneDayVolumeUSD = oneDayVolumeUSD
      data.volumeChangeUSD = volumeChangeUSD
      data.oneDayVolumeETH = oneDayVolumeETH
      data.volumeChangeETH = volumeChangeETH
      data.liquidityChangeUSD = liquidityChangeUSD
      data.oneDayTxns = oneDayTxns
      data.txnChange = txnChange
    }
  } catch (e) {
    console.log(e)
  }

  return data
}

const getChartData = async oldestDateToFetch => {
  let data = []
  let weeklyData = []

  const utcEndTime = dayjs.utc()

  try {
    let result = await client.query({
      query: GLOBAL_CHART,
      variables: {
        startTime: oldestDateToFetch
      },
      fetchPolicy: 'cache-first'
    })

    data = [...result.data.emiswapDayDatas]

    if (data) {
      let dayIndexSet = new Set()
      let dayIndexArray = []
      const oneDay = 24 * 60 * 60
      data.forEach((dayData, i) => {
        // add the day index to the set of days
        dayIndexSet.add((data[i].date / oneDay).toFixed(0))
        dayIndexArray.push(data[i])
        dayData.dailyVolumeUSD = parseFloat(dayData.dailyVolumeUSD)
      })

      // fill in empty days
      let timestamp = data[0].date ? data[0].date : oldestDateToFetch
      let latestLiquidityUSD = data[0].totalLiquidityUSD
      let latestDayDats = data[0].mostLiquidTokens
      let index = 1
      while (timestamp < utcEndTime.unix() - oneDay) {
        const nextDay = timestamp + oneDay
        let currentDayIndex = (nextDay / oneDay).toFixed(0)
        if (!dayIndexSet.has(currentDayIndex)) {
          data.push({
            date: nextDay,
            dailyVolumeUSD: 0,
            totalLiquidityUSD: latestLiquidityUSD,
            mostLiquidTokens: latestDayDats
          })
        } else {
          latestLiquidityUSD = dayIndexArray[index].totalLiquidityUSD
          latestDayDats = dayIndexArray[index].mostLiquidTokens
          index = index + 1
        }
        timestamp = nextDay
      }
    }

    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1))
    let startIndexWeekly = -1
    let currentWeek = -1
    data.forEach((dayData, i) => {
      const week = dayjs.utc(dayjs.unix(data[i].date)).week()
      if (week !== currentWeek) {
        currentWeek = week
        startIndexWeekly++
      }
      weeklyData[startIndexWeekly] = weeklyData[startIndexWeekly] || {}
      weeklyData[startIndexWeekly].date = data[i].date
      weeklyData[startIndexWeekly].weeklyVolumeUSD = weeklyData[startIndexWeekly].weeklyVolumeUSD
        ? weeklyData[startIndexWeekly].weeklyVolumeUSD + data[i].dailyVolumeUSD
        : data[i].dailyVolumeUSD
    })
  } catch (e) {
    console.log(e)
  }
  return [data, weeklyData]
}

const getGlobalTransactions = async () => {
  let transactions = {}

  try {
    let result = await client.query({
      query: GLOBAL_TXNS,
      fetchPolicy: 'cache-first'
    })
    transactions.mints = []
    transactions.burns = []
    transactions.swaps = []

    result?.data?.transactions &&
      result.data.transactions.map(transaction => {
        if (transaction.mints.length > 0) {
          transaction.mints.map(mint => {
            return transactions.mints.push(mint)
          })
        }
        if (transaction.burns.length > 0) {
          transaction.burns.map(burn => {
            return transactions.burns.push(burn)
          })
        }
        if (transaction.swaps.length > 0) {
          transaction.swaps.map(swap => {
            return transactions.swaps.push(swap)
          })
        }
        return true
      })
  } catch (e) {
    console.log(e)
  }

  return transactions
}

const getEthPrice = async () => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime
    .subtract(1, 'day')
    .startOf('minute')
    .unix()

  let ethPrice = 0
  let ethPriceOneDay = 0
  let priceChangeETH = 0

  try {
    let oneDayBlock = await getBlockFromTimestamp(utcOneDayBack)
    let result = await client.query({
      query: ETH_PRICE(),
      fetchPolicy: 'cache-first'
    })
    let resultOneDay = await client.query({
      query: ETH_PRICE(oneDayBlock),
      fetchPolicy: 'cache-first'
    })
    const currentPrice = result?.data?.bundles[0]?.ethPrice
    const oneDayBackPrice = resultOneDay?.data?.bundles[0]?.ethPrice
    priceChangeETH = getPercentChange(currentPrice, oneDayBackPrice)
    ethPrice = currentPrice
    ethPriceOneDay = oneDayBackPrice
  } catch (e) {
    console.log(e)
  }

  return [ethPrice, ethPriceOneDay, priceChangeETH]
}

async function getAllPairsOnEmiswap() {
  try {
    let allFound = false
    let pairs = []
    let skipCount = 0
    while (!allFound) {
      let result = await client.query({
        query: ALL_PAIRS,
        variables: {
          skip: skipCount
        },
        fetchPolicy: 'cache-first'
      })
      skipCount = skipCount + 1000
      pairs = pairs.concat(result?.data?.pairs)
      if (result?.data?.pairs.length < 1000) {
        allFound = true
      }
    }
    return pairs
  } catch (e) {
    console.log(e)
  }
}

async function getAllTokensOnEmiswap() {
  try {
    let allFound = false
    let skipCount = 0
    let tokens = []
    while (!allFound) {
      let result = await client.query({
        query: ALL_TOKENS,
        variables: {
          skip: skipCount
        },
        fetchPolicy: 'cache-first'
      })
      tokens = tokens.concat(result?.data?.tokens)
      if (result?.data?.tokens?.length < 1000) {
        allFound = true
      }
      skipCount = skipCount += 1000
    }
    return tokens
  } catch (e) {
    console.log(e)
  }
}

export function useGlobalData() {
  const [state, { update, updateAllPairsInEmiswap, updateAllTokensInEmiswap }] = useGlobalDataContext()
  const [ethPrice, oldEthPrice] = useEthPrice()

  const data = state?.globalData

  useEffect(() => {
    async function fetchData() {
      let globalData = await getGlobalData(ethPrice, oldEthPrice)
      globalData && update(globalData)

      let allPairs = await getAllPairsOnEmiswap()
      updateAllPairsInEmiswap(allPairs)

      let allTokens = await getAllTokensOnEmiswap()
      updateAllTokensInEmiswap(allTokens)
    }
    if (!data && ethPrice && oldEthPrice) {
      fetchData()
    }
  }, [ethPrice, oldEthPrice, update, data, updateAllPairsInEmiswap, updateAllTokensInEmiswap])

  return data || {}
}

export function useGlobalChartData() {
  const [state, { updateChart }] = useGlobalDataContext()
  const [oldestDateFetch, setOldestDateFetched] = useState()
  const [activeWindow] = useTimeframe()

  const chartDataDaily = state?.chartData?.daily
  const chartDataWeekly = state?.chartData?.weekly

  // monitor the old date fetched
  useEffect(() => {
    const utcEndTime = dayjs.utc()
    // based on window, get starttime
    let utcStartTime
    switch (activeWindow) {
      case timeframeOptions.WEEK:
        utcStartTime = utcEndTime.subtract(1, 'week').startOf('day')
        break
      case timeframeOptions.ALL_TIME:
        utcStartTime = utcEndTime.subtract(1, 'year')
        break
      default:
        utcStartTime = utcEndTime.subtract(1, 'year').startOf('year')
        break
    }
    let startTime = utcStartTime.startOf('hour').unix() - 1

    if ((activeWindow && startTime < oldestDateFetch) || !oldestDateFetch) {
      setOldestDateFetched(startTime)
    }
  }, [activeWindow, oldestDateFetch])

  useEffect(() => {
    async function fetchData() {
      // historical stuff for chart
      let [newChartData, newWeeklyData] = await getChartData(oldestDateFetch)
      updateChart(newChartData, newWeeklyData)
    }
    if (oldestDateFetch && !(chartDataDaily && chartDataWeekly)) {
      fetchData()
    }
  }, [chartDataDaily, chartDataWeekly, oldestDateFetch, updateChart])

  return [chartDataDaily, chartDataWeekly]
}

export function useGlobalTransactions() {
  const [state, { updateTransactions }] = useGlobalDataContext()
  const transactions = state?.transactions
  useEffect(() => {
    async function fetchData() {
      if (!transactions) {
        let txns = await getGlobalTransactions()
        updateTransactions(txns)
      }
    }
    fetchData()
  }, [updateTransactions, transactions])
  return transactions
}

export function useEthPrice() {
  const [state, { updateEthPrice }] = useGlobalDataContext()
  const ethPrice = state?.[ETH_PRICE_KEY]
  const ethPriceOld = state?.['oneDayPrice']
  useEffect(() => {
    async function checkForEthPrice() {
      if (!ethPrice) {
        let [newPrice, oneDayPrice, priceChange] = await getEthPrice()
        updateEthPrice(newPrice, oneDayPrice, priceChange)
      }
    }
    checkForEthPrice()
  }, [ethPrice, updateEthPrice])

  return [ethPrice, ethPriceOld]
}

export function useAllPairsInEmiswap() {
  const [state] = useGlobalDataContext()
  let allPairs = state?.allPairs

  return allPairs || []
}

export function useAllTokensInEmiswap() {
  const [state] = useGlobalDataContext()
  let allTokens = state?.allTokens

  return allTokens || []
}
