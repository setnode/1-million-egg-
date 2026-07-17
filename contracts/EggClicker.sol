// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 */
abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != ENTERED, "ReentrancyGuard: reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract EggClicker is ReentrancyGuard {
    address public owner;
    IERC20 public usdcToken;

    uint256 public constant TAP_FEE = 0.0000055 ether;
    uint256 public globalScore;
    
    mapping(address => uint256) public scores;
    mapping(address => uint256) public eggBalances;
    
    struct PlayerScore {
        address player;
        uint256 score;
    }
    
    PlayerScore[100] public leaderboard;

    event Tapped(address indexed player, uint256 newScore, uint256 globalScore, uint256 newEggBalance);
    event RewardClaimed(address indexed player, uint256 usdcAmount, uint256 eggsSpent);
    event WithdrawnETH(address indexed owner, uint256 amount);
    event WithdrawnUSDC(address indexed owner, uint256 amount);

    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    function tap() external payable {
        require(msg.value == TAP_FEE, "Incorrect fee amount");
        
        uint256 newScore = scores[msg.sender] + 1;
        scores[msg.sender] = newScore;
        eggBalances[msg.sender] += 1;
        globalScore += 1;
        
        updateLeaderboard(msg.sender, newScore);

        emit Tapped(msg.sender, newScore, globalScore, eggBalances[msg.sender]);
    }

    function claimReward(uint8 tier) external nonReentrant {
        uint256 requiredEggs = 0;
        uint256 usdcReward = 0;

        if (tier == 1) {
            requiredEggs = 30;
            usdcReward = 100000; // 0.10 USDC (USDC has 6 decimals)
        } else if (tier == 2) {
            requiredEggs = 80;
            usdcReward = 500000; // 0.50 USDC
        } else if (tier == 3) {
            requiredEggs = 150;
            usdcReward = 1000000; // 1.00 USDC
        } else if (tier == 4) {
            requiredEggs = 650;
            usdcReward = 5000000; // 5.00 USDC
        } else if (tier == 5) {
            requiredEggs = 1200;
            usdcReward = 10000000; // 10.00 USDC
        } else if (tier == 6) {
            requiredEggs = 5500;
            usdcReward = 50000000; // 50.00 USDC
        } else if (tier == 7) {
            requiredEggs = 10500;
            usdcReward = 100000000; // 100.00 USDC
        } else {
            revert("Invalid tier");
        }

        require(eggBalances[msg.sender] >= requiredEggs, "Insufficient eggs");
        require(usdcToken.balanceOf(address(this)) >= usdcReward, "Contract out of USDC");

        eggBalances[msg.sender] -= requiredEggs;
        
        require(usdcToken.transfer(msg.sender, usdcReward), "USDC Transfer failed");

        emit RewardClaimed(msg.sender, usdcReward, requiredEggs);
    }

    function updateLeaderboard(address player, uint256 score) internal {
        uint256 insertIndex = 100;
        uint256 playerCurrentIndex = 100;

        for (uint256 i = 0; i < 100; i++) {
            if (leaderboard[i].player == player) {
                playerCurrentIndex = i;
                break;
            }
        }

        for (uint256 i = 0; i < 100; i++) {
            if (score > leaderboard[i].score) {
                insertIndex = i;
                break;
            }
        }

        if (insertIndex < 100) {
            if (playerCurrentIndex < 100) {
                if (insertIndex < playerCurrentIndex) {
                    for (uint256 j = playerCurrentIndex; j > insertIndex; j--) {
                        leaderboard[j] = leaderboard[j - 1];
                    }
                    leaderboard[insertIndex] = PlayerScore(player, score);
                } else {
                    leaderboard[playerCurrentIndex].score = score;
                }
            } else {
                for (uint256 j = 99; j > insertIndex; j--) {
                    leaderboard[j] = leaderboard[j - 1];
                }
                leaderboard[insertIndex] = PlayerScore(player, score);
            }
        }
    }
    
    function getLeaderboard() external view returns (PlayerScore[100] memory) {
        return leaderboard;
    }

    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "ETH Transfer failed");

        emit WithdrawnETH(owner, balance);
    }

    function withdrawUSDC(uint256 amount) external onlyOwner {
        require(usdcToken.balanceOf(address(this)) >= amount, "Insufficient USDC");
        require(usdcToken.transfer(owner, amount), "USDC Transfer failed");

        emit WithdrawnUSDC(owner, amount);
    }
}
