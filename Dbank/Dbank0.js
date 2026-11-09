const $ = id => document.getElementById(id);
const [cWallet, wAddr, wCard, balEl, usdEl, copyBtn, msgEl, cInput, cBtn, depBtn, witBtn, chkBtn, amtIn, bankEl, txList] = 
    ["connectWallet", "walletAddress", "walletAddressCard", "balance", "usdBalance", "copyAddress", "statusMessage", "contractAddress", "connectContractBtn", "depositBtn", "withdrawBtn", "checkBalanceBtn", "amount", "bankBalance", "transactionList"].map($);

let provider, signer, account, contract, address, balanceFn;
const KEY = "dbank_contract_address";
const ABI = [
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function checkBlance() view returns (uint256)",
    "function checkBalance() view returns (uint256)",
    "event Deposit(address indexed user, uint256 amount, uint256 timestamp)",
    "event Withdraw(address indexed user, uint256 amount, uint256 timestamp)"
];

const showStatus = (msg, err) => {
    msgEl.textContent = msg; msgEl.className = `status-message ${err ? "error" : "success"}`;
    let t = $("toast") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "toast" }));
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:14px 22px;border-radius:14px;color:#fff;font:500 15px Prompt,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:9999;transition:opacity .3s;";
    t.textContent = msg; t.style.background = err ? "#e63946" : "#16a36a"; t.style.opacity = "1";
    clearTimeout(showStatus.t); showStatus.t = setTimeout(() => t.style.opacity = "0", 5000);
};

const setBusy = b => [depBtn, witBtn, chkBtn, cBtn].forEach(el => { el.disabled = b; el.style.opacity = b ? "0.6" : ""; el.style.cursor = b ? "wait" : ""; });
const shortAddr = a => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
const parseErr = e => e?.code === 4001 || e?.code === "ACTION_REJECTED" ? "คุณปฏิเสธธุรกรรม" : (e?.reason || e?.shortMessage || e?.message || "เกิดข้อผิดพลาด");

const updateBalances = async () => {
    if (!provider || !account) return;
    balEl.textContent = Number(ethers.formatEther(await provider.getBalance(account))).toFixed(4);
    const net = await provider.getNetwork();
    usdEl.textContent = `Network: ${net.name} (Chain ID: ${net.chainId})`;
};

// --- ระบบจัดการประวัติ (Hybrid: ดึงจาก Blockchain Events + LocalStorage สำรอง) ---
const getLocalStorageKey = () => `dbank_tx_${account ? account.toLowerCase() : 'default'}`;

const getSavedLocalTxs = () => {
    try { return JSON.parse(localStorage.getItem(getLocalStorageKey())) || []; } catch { return []; }
};

const saveLocalTx = (txData) => {
    const txs = getSavedLocalTxs();
    // ป้องกันการบันทึก Hash ซ้ำซ้อน
    if (!txs.some(t => t.hash.toLowerCase() === txData.hash.toLowerCase())) {
        txs.unshift(txData);
        localStorage.setItem(getLocalStorageKey(), JSON.stringify(txs));
    }
};

let cachedTransactions = [];

const fetchTransactions = async (showAll = false) => {
    if (!contract || !account) return;
    try {
        let allTxs = [];
        
        // พยายามดึงจาก Blockchain Events ก่อน
        try {
            const filterDeposit = contract.filters.Deposit(account);
            const filterWithdraw = contract.filters.Withdraw(account);
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 50000); // ดึงย้อนหลัง 50,000 บล็อกเพื่อความเร็ว

            const [depositEvents, withdrawEvents] = await Promise.all([
                contract.queryFilter(filterDeposit, fromBlock, "latest"),
                contract.queryFilter(filterWithdraw, fromBlock, "latest")
            ]);

            depositEvents.forEach(ev => {
                allTxs.push({
                    type: "Deposit",
                    amount: ethers.formatEther(ev.args.amount),
                    hash: ev.transactionHash,
                    status: "Success",
                    blockNumber: ev.blockNumber || 0
                });
            });

            withdrawEvents.forEach(ev => {
                allTxs.push({
                    type: "Withdraw",
                    amount: ethers.formatEther(ev.args.amount),
                    hash: ev.transactionHash,
                    status: "Success",
                    blockNumber: ev.blockNumber || 0
                });
            });
        } catch (e) {
            console.warn("Contract has no events or queryFilter failed, falling back to local storage.", e);
        }

        // นำข้อมูลจาก LocalStorage มาผสานรวมด้วย เพื่อให้ประวัติที่เพิ่งทำรายการขึ้นโชว์ทันที
        const localTxs = getSavedLocalTxs();
        localTxs.forEach(local => {
            if (!allTxs.some(t => t.hash.toLowerCase() === local.hash.toLowerCase())) {
                allTxs.push(local);
            }
        });

        // เรียงลำดับใหม่
        allTxs.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
        cachedTransactions = allTxs;

        renderTransactionTable(showAll);
    } catch (err) {
        console.error("Error fetching transactions:", err);
        cachedTransactions = getSavedLocalTxs();
        renderTransactionTable(showAll);
    }
};

const renderTransactionTable = (showAll = false) => {
    txList.innerHTML = "";
    
    if (cachedTransactions.length === 0) {
        txList.className = "empty-transaction";
        txList.textContent = "No transactions yet";
        return;
    }

    txList.className = "";
    // จำกัดแสดงแค่ 10 รายการแรก เว้นแต่กด View All
    const displayTxs = showAll ? cachedTransactions : cachedTransactions.slice(0, 10);

    displayTxs.forEach(tx => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `<span>${tx.type}</span><span>${tx.amount} ETH</span><span title="${tx.hash}">${shortAddr(tx.hash)}</span><span style="color:${tx.status === 'Success' ? '#16a36a' : '#e6ab16'}">${tx.status}</span>`;
        txList.appendChild(row);
    });

    // ปุ่ม View All / Show Less
    let viewAllBtn = document.querySelector(".transaction-header a");
    if (viewAllBtn) {
        viewAllBtn.textContent = showAll ? "Show Less ↑" : "View All →";
        viewAllBtn.onclick = (e) => {
            e.preventDefault();
            renderTransactionTable(!showAll);
        };
    }
};

const connectWallet = async () => {
    try {
        const eth = window.ethereum;
        if (!eth) throw new Error("กรุณาติดตั้ง MetaMask");
        showStatus("กำลังเชื่อมต่อ...");
        const accounts = await eth.request({ method: "eth_requestAccounts" });
        if (!accounts.length) throw new Error("ไม่พบบัญชี");
        provider = new ethers.BrowserProvider(eth); 
        signer = await provider.getSigner(); 
        account = accounts[0];
        
        wAddr.textContent = wCard.textContent = shortAddr(account);
        cWallet.innerHTML = `<span>🦊</span><span>${shortAddr(account)}</span><span class="arrow">✓</span>`;
        
        await updateBalances(); 
        await restoreContract(); 
        showStatus("เชื่อมต่อสำเร็จ");
    } catch (e) { showStatus(parseErr(e), true); }
};

const readBalance = async () => {
    for (const name of balanceFn ? [balanceFn] : ["checkBlance", "checkBalance"]) {
        try { const val = await contract[name](); balanceFn = name; return val; } catch {}
    }
    throw new Error("ไม่พบฟังก์ชันเช็กยอดเงิน");
};

const refreshBank = async () => {
    if (!contract) return;
    const bal = await readBalance();
    bankEl.textContent = `Bank Blance: ${ethers.formatEther(bal)} ETH`;
    return bal;
};

const setupContract = async (addr) => {
    if (!provider || !signer) throw new Error("กรุณา Connect Wallet ก่อน");
    if (!ethers.isAddress(addr)) throw new Error("Address ไม่ถูกต้อง");
    if (await provider.getCode(addr) === "0x") throw new Error("ไม่พบ Contract");
    
    contract = new ethers.Contract(addr, ABI, signer); 
    balanceFn = null; 
    address = addr;
    localStorage.setItem(KEY, addr); 
    cBtn.innerHTML = "<span>✅</span><span>Connected</span>";

    // ดึงประวัติทันทีที่เชื่อมต่อ Contract สำเร็จ
    await fetchTransactions();
};

const restoreContract = async () => {
    const addr = (cInput.value || localStorage.getItem(KEY) || "").trim();
    if (!addr) return; cInput.value = addr;
    try { await setupContract(addr); await refreshBank(); } 
    catch { contract = null; cBtn.innerHTML = "<span>🔗</span><span>Connect</span>"; }
};

cWallet.onclick = connectWallet;
copyBtn.onclick = () => account ? (navigator.clipboard.writeText(account), showStatus("คัดลอก Address แล้ว")) : showStatus("ยังไม่เชื่อมต่อ Wallet", true);

cInput.oninput = () => {
    if (contract && cInput.value.trim() !== address) { 
        contract = null; 
        cBtn.innerHTML = "<span>🔗</span><span>Connect</span>"; 
        bankEl.textContent = "Bank Blance: -"; 
    }
};

cBtn.onclick = async () => {
    setBusy(true);
    try { await setupContract(cInput.value.trim()); await refreshBank(); showStatus("เชื่อมต่อ Contract สำเร็จ"); }
    catch (e) { contract = null; cBtn.innerHTML = "<span>🔗</span><span>Connect</span>"; showStatus(parseErr(e), true); }
    finally { setBusy(false); }
};

const handleTx = async (name, fn) => {
    setBusy(true);
    try {
        if (!contract) throw new Error("กรุณาเชื่อมต่อ Contract");
        const val = amtIn.value.trim();
        if (!val || Number(val) <= 0) throw new Error("กรุณาใส่จำนวน ETH > 0");
        showStatus("กรุณายืนยันใน MetaMask...");
        
        const tx = await fn(ethers.parseEther(val));
        showStatus("กำลังรอการยืนยันบนบล็อกเชน...");

        // บันทึกลงระบบสำรองทันทีที่ส่งธุรกรรม
        const newTx = { type: name, amount: val, hash: tx.hash, status: "Pending", blockNumber: 99999999 };
        saveLocalTx(newTx);
        await fetchTransactions();
        
        const receipt = await tx.wait();
        if (receipt?.status === 1) {
            showStatus(`${name}สำเร็จ`);
            // อัปเดตสถานะเป็น Success เมื่อคอนเฟิร์มแล้ว
            let txs = getSavedLocalTxs();
            let target = txs.find(t => t.hash.toLowerCase() === tx.hash.toLowerCase());
            if (target) {
                target.status = "Success";
                localStorage.setItem(getLocalStorageKey(), JSON.stringify(txs));
            }
            await fetchTransactions();
        } else {
            showStatus("ธุรกรรมล้มเหลว", true);
        }

        await updateBalances(); 
        await refreshBank(); 
    } catch (e) { 
        showStatus(parseErr(e), true); 
    } finally { 
        setBusy(false); 
    }
};

depBtn.onclick = () => handleTx("Deposit", w => contract.deposit({ value: w }));
witBtn.onclick = () => handleTx("Withdraw", w => contract.withdraw(w));
chkBtn.onclick = async () => {
    setBusy(true);
    try { showStatus(`ยอดคงเหลือ: ${ethers.formatEther(await refreshBank())} ETH`); }
    catch (e) { showStatus(parseErr(e), true); }
    finally { setBusy(false); }
};

// สลับ Account ใน MetaMask ให้รีเฟรชข้อมูลตารางใหม่ทันที
if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
            account = null;
            txList.innerHTML = "No transactions yet";
            txList.className = "empty-transaction";
        } else {
            connectWallet();
        }
    });
}

(async () => {
    const eth = window.ethereum;
    if (eth && (await eth.request({ method: "eth_accounts" })).length) connectWallet();
})();