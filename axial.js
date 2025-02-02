
// Required Packages:
const { ethers } = require('ethers');
const axios = require('axios');

// Required Config Variables:
const config = require('./config.js');

// Setting Up RPCs:
const avax = new ethers.providers.JsonRpcProvider(config.rpc);

// Setting Time Variables:
const time = Math.round(Date.now() / 1000);
const start = 1636588800;
const week = 604800;

// Setting Up Optional Args:
let basic = false;
const args = process.argv.slice(2);
if(args.length > 0) {
  if(args[0] === 'basic') {
    basic = true;
  }
}

/* ====================================================================================================================================================== */

// Function to get AXIAL Price:
const getPrice = async () => {
  let query = 'https://api.coingecko.com/api/v3/simple/token_price/avalanche?contract_addresses=' + config.axial + '&vs_currencies=usd';
  let result = await axios.get(query);
  let price = result.data[config.axial.toLowerCase()].usd.toFixed(4);
  console.log('Price loaded...');
  return price;
}

/* ====================================================================================================================================================== */

// Function to get total AXIAL supply:
const getTotalSupply = async () => {
  let contract = new ethers.Contract(config.axial, config.minABI, avax);
  let supply = await contract.totalSupply();
  console.log('Total supply loaded...');
  return supply / (10 ** 18);
}

/* ====================================================================================================================================================== */

// Function to get AXIAL in treasury:
const getTreasuryBalance = async () => {
  let contract = new ethers.Contract(config.axial, config.minABI, avax);
  let treasuryBalance = parseInt(await contract.balanceOf(config.treasury));
  console.log('Treasury balance loaded...');
  return treasuryBalance / (10 ** 18);
}

/* ====================================================================================================================================================== */

// Function to get AXIAL in Axial's treasury:
const getAxialTreasuryBalance = async () => {
  let contract = new ethers.Contract(config.axial, config.minABI, avax);
  let treasuryBalance = parseInt(await contract.balanceOf(config.axialTreasury));
  console.log('Axial\'s treasury balance loaded...');
  return treasuryBalance / (10 ** 18);
}

/* ====================================================================================================================================================== */

// Function to get circulating AXIAL supply:
const getCirculatingSupply = (total, treasury, axialTreasury) => {
  let circulatingSupply = total - treasury - axialTreasury;
  return circulatingSupply;
}

/* ====================================================================================================================================================== */

// Function to get transactions:
const getTXs = async () => {
  let txs = {};
  let promises = config.axialPools.map(pool => (async () => {
    txs[pool.name] = [];
    let page = 0;
    let hasNextPage = false;
    do {
      try {
        let query = 'https://api.covalenthq.com/v1/43114/address/' + pool.swap + '/transactions_v2/?page-size=1000&page-number=' + page++ + '&key=' + config.ckey;
        let result = await axios.get(query);
        if(!result.data.error) {
          hasNextPage = result.data.data.pagination.has_more;
          let tx_promises = result.data.data.items.map(tx => (async () => {
            if(tx.successful) {
              tx.log_events.forEach(event => {
                if(event.decoded != null && event.decoded.name === 'Transfer' && event.decoded.params[1].value.toLowerCase() === pool.swap.toLowerCase()) {
                  txs[pool.name].push({
                    wallet: event.decoded.params[0].value,
                    time: (new Date(tx.block_signed_at)).getTime() / 1000,
                    amount: event.decoded.params[2].value / (10 ** event.sender_contract_decimals)
                  });
                }
              });
            }
          })());
          await Promise.all(tx_promises);
        } else {
          hasNextPage = false;
        }
      } catch {
        console.log('API ERROR: Covalent is likely down.');
        hasNextPage = false;
      }
    } while(hasNextPage);
    console.log(`${pool.name} transactions loaded...`);
  })());
  await Promise.all(promises);
  return txs;
}

/* ====================================================================================================================================================== */

// Function to get total number of transactions:
const getNumTXs = (txs) => {
  let sum = 0;
  config.axialPools.forEach(pool => {
    sum += txs[pool.name].length;
  });
  return sum;
}

/* ====================================================================================================================================================== */

// Function to get total value swapped:
const getTotalSwapped = (txs) => {
  let sum = 0;
  config.axialPools.forEach(pool => {
    txs[pool.name].forEach(tx => {
      sum += tx.amount;
    });
  });
  return sum;
}

/* ====================================================================================================================================================== */

// Function to get total weekly volume:
const getWeeklyVolume = (txs) => {
  let values = [];
  let i = 0;
  config.axialPools.forEach(pool => {
    for(let tempTime = start; tempTime < time; tempTime += week) {
      let weekTime = values.find(i => i.time === tempTime);
      if(weekTime) {
        let sum = 0;
        txs[pool.name].forEach(tx => {
          if(tx.time > tempTime && tx.time < tempTime + week) {
            sum += tx.amount;
          }
        });
        weekTime.volume += sum;
      } else {
        let sum = 0;
        txs[pool.name].forEach(tx => {
          if(tx.time > tempTime && tx.time < tempTime + week) {
            sum += tx.amount;
          }
        });
        values.push({
          week: ++i,
          time: tempTime,
          volume: sum
        });
      }
    }
  });
  return values;
}

/* ====================================================================================================================================================== */

// Function to get pool-specific number of transactions:
const getPoolNumTXs = (txs) => {
  let values = [];
  config.axialPools.forEach(pool => {
    values.push({
      name: pool.name,
      txCount: txs[pool.name].length
    });
  });
  values.sort((a, b) => b.txCount - a.txCount);
  return values;
}

/* ====================================================================================================================================================== */

// Function to get pool-specific value swapped:
const getPoolValueSwapped = (txs) => {
  let values = [];
  config.axialPools.forEach(pool => {
    let sum = 0;
    txs[pool.name].forEach(tx => {
      sum += tx.amount;
    });
    values.push({
      name: pool.name,
      amount: sum
    });
  });
  values.sort((a, b) => b.amount - a.amount);
  return values;
}

/* ====================================================================================================================================================== */

// Function to get pool-specific weekly volume:
const getPoolWeeklyVolume = (txs) => {
  let values = [];
  config.axialPools.forEach(pool => {
    values.push({
      name: pool.name,
      weeks: []
    });
    let i = 0;
    for(let tempTime = start; tempTime < time; tempTime += week) {
      let poolValues = values.find(i => i.name === pool.name);
      let weekTime = poolValues.weeks.find(i => i.time === tempTime);
      if(weekTime) {
        let sum = 0;
        txs[pool.name].forEach(tx => {
          if(tx.time > tempTime && tx.time < tempTime + week) {
            sum += tx.amount;
          }
        });
        weekTime.volume += sum;
      } else {
        let sum = 0;
        txs[pool.name].forEach(tx => {
          if(tx.time > tempTime && tx.time < tempTime + week) {
            sum += tx.amount;
          }
        });
        poolValues.weeks.push({
          week: ++i,
          time: tempTime,
          volume: sum
        });
      }
    }
  });
  return values;
}

/* ====================================================================================================================================================== */

// Function to get biggest swappers:
const getBiggestSwappers = (txs) => {
  let wallets = [];
  config.axialPools.forEach(pool => {
    txs[pool.name].forEach(tx => {
      let wallet = wallets.find(i => i.address === tx.wallet);
      if(wallet) {
        wallet.amount += tx.amount;
      } else {
        wallets.push({
          address: tx.wallet,
          amount: tx.amount
        });
      }
    });
  });
  wallets.sort((a, b) => b.amount - a.amount);
  return wallets.slice(0, 5);
}

/* ====================================================================================================================================================== */

// Function to pad date if necessary:
const pad = (num) => {
  let str = num.toString();
  if(str.length < 2) {
    return '0' + str;
  } else {
    return str;
  }
}

/* ====================================================================================================================================================== */

// Function to fetch all stats:
const fetch = async () => {

  // Full Data:
  if(!basic) {

    // Fetching Data:
    let price = await getPrice();
    let totalSupply = await getTotalSupply();
    let treasuryBalance = await getTreasuryBalance();
    let axialTreasuryBalance = await getAxialTreasuryBalance();
    let circulatingSupply = getCirculatingSupply(totalSupply, treasuryBalance, axialTreasuryBalance);
    let txs = await getTXs();
    let numTXs = getNumTXs(txs);
    let totalSwapped = getTotalSwapped(txs);
    let weeklyVolume = getWeeklyVolume(txs);
    let poolNumTXs = getPoolNumTXs(txs);
    let poolValueSwapped = getPoolValueSwapped(txs);
    let poolWeeklyVolume = getPoolWeeklyVolume(txs);
    let biggestSwappers = getBiggestSwappers(txs);

    // Printing Data:
    console.log('\n  ===============================');
    console.log('  ||        AXIAL Stats        ||');
    console.log('  ===============================\n');
    console.log('  - AXIAL Price:', '$' + price);
    console.log('  - Total AXIAL Supply:', totalSupply.toLocaleString(undefined, {maximumFractionDigits: 0}), 'AXIAL');
    console.log('  - AXIAL Market Cap:', '$' + (price * totalSupply).toLocaleString(undefined, {maximumFractionDigits: 0}));
    console.log('  - Treasury:', '$' + (price * treasuryBalance).toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + treasuryBalance.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' AXIAL)');
    console.log('  - Axial Treasury:', '$' + (price * axialTreasuryBalance).toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + axialTreasuryBalance.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' AXIAL)');
    console.log('  - Circulating AXIAL Supply:', circulatingSupply.toLocaleString(undefined, {maximumFractionDigits: 0}), 'AXIAL (' + ((circulatingSupply / totalSupply) * 100).toFixed(2) + '% of total supply)');
    console.log('  - Total # of Swap Transactions:', numTXs.toLocaleString(undefined, {maximumFractionDigits: 0}), 'TXs');
    console.log('  - Total Value Swapped:', '$' + totalSwapped.toLocaleString(undefined, {maximumFractionDigits: 0}));
    console.log('  - Weekly Volume Swapped:');
    weeklyVolume.forEach(item => {
      let rawDate = new Date((item.time) * 1000);
      let date = pad(rawDate.getUTCDate()) + '/' + pad(rawDate.getUTCMonth() + 1) + '/' + rawDate.getUTCFullYear();
      console.log('      > Week' + (item.week < 10 ? '' : ''), item.week.toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + date + ') - $' + item.volume.toLocaleString(undefined, {maximumFractionDigits: 0}));
    });
    console.log('  - Pool-Specific # of Swap Transactions:');
    poolNumTXs.forEach(pool => {
      console.log('      >', pool.name, '-', pool.txCount.toLocaleString(undefined, {maximumFractionDigits: 0}), 'TXs');
    });
    console.log('  - Pool-Specific Value Swapped:');
    poolValueSwapped.forEach(pool => {
      console.log('      >', pool.name, '- $' + pool.amount.toLocaleString(undefined, {maximumFractionDigits: 0}));
    });
    console.log('  - Pool-Specific Weekly Volume Swapped:');
    poolWeeklyVolume.forEach(pool => {
      console.log('      >', pool.name + ':');
      pool.weeks.forEach(weeklyValue => {
        let rawDate = new Date((weeklyValue.time) * 1000);
        let date = pad(rawDate.getUTCDate()) + '/' + pad(rawDate.getUTCMonth() + 1) + '/' + rawDate.getUTCFullYear();
        console.log('        - Week' + (weeklyValue.week < 10 ? '' : ''), weeklyValue.week.toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + date + ') - $' + weeklyValue.volume.toLocaleString(undefined, {maximumFractionDigits: 0}));
      });
    });
    console.log('  - Top 5 Biggest Swappers:');
    biggestSwappers.forEach(wallet => {
      console.log('      >', wallet.address, '- $' + wallet.amount.toLocaleString(undefined, {maximumFractionDigits: 0}), (wallet.address === config.paraswap ? '(ParaSwap Router)' : ''));
    });

  // Basic Data (Loads Faster):
  } else {

    // Fetching Data:
    let price = await getPrice();
    let totalSupply = await getTotalSupply();
    let treasuryBalance = await getTreasuryBalance();
    let axialTreasuryBalance = await getAxialTreasuryBalance();
    let circulatingSupply = getCirculatingSupply(totalSupply, treasuryBalance, axialTreasuryBalance);

    // Printing Data:
    console.log('\n  ==============================');
    console.log('  ||       AXIAL Stats        ||');
    console.log('  ==============================\n');
    console.log('  - AXIAL Price:', '$' + price);
    console.log('  - Total AXIAL Supply:', totalSupply.toLocaleString(undefined, {maximumFractionDigits: 0}), 'AXIAL');
    console.log('  - AXIAL Market Cap:', '$' + (price * totalSupply).toLocaleString(undefined, {maximumFractionDigits: 0}));
    console.log('  - Treasury:', '$' + (price * treasuryBalance).toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + treasuryBalance.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' AXIAL)');
    console.log('  - Axial Treasury:', '$' + (price * axialTreasuryBalance).toLocaleString(undefined, {maximumFractionDigits: 0}), '(' + axialTreasuryBalance.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' AXIAL)');
    console.log('  - Circulating AXIAL Supply:', circulatingSupply.toLocaleString(undefined, {maximumFractionDigits: 0}), 'AXIAL (' + ((circulatingSupply / totalSupply) * 100).toFixed(2) + '% of total supply)');
  }
}

/* ====================================================================================================================================================== */

// Fetching Data:
fetch();
