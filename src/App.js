import logo from './logo.svg';
import './App.css';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useRef } from 'react';

function App() {
  // Supabase 配置
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 上传读取文字功能
  const [text, setText] = useState(''); // 最新文字（用户名）
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectStatus, setConnectStatus] = useState('checking');

  // 贪吃蛇相关
  const rows = 20;
  const cols = 20;
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [direction, setDirection] = useState('right');
  const [pendingDirection, setPendingDirection] = useState('right');
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [paused, setPaused] = useState(true); // 初始为暂停
  const [gameOverFlag, setGameOverFlag] = useState(false);
  const [intervalMs] = useState(200);
  const intervalRef = useRef(null);
  const [snakeLength, setSnakeLength] = useState(1);

  // 排行榜
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);

  // 历史排行榜
  const [historyBoard, setHistoryBoard] = useState([]);
  // 实时排行榜
  const [realtimeBoard, setRealtimeBoard] = useState([]);

  // 在组件顶部添加状态
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");

  // 读取最新文字（用户名）
  const fetchLatestText = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('texts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setText(data[0].content);
    } else {
      setText('');
    }
    setLoading(false);
  };

  // 检查 Supabase 连接
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('texts').select('id').limit(1);
        if (error) {
          setConnectStatus('fail');
        } else {
          setConnectStatus('success');
        }
      } catch (e) {
        setConnectStatus('fail');
      }
    };
    checkConnection();
  }, [supabase]);

  // 页面加载时拉取历史和实时排行榜
  useEffect(() => {
    fetchLatestText();
    fetchHistoryBoard();
    fetchRealtimeBoard();
  }, []);

  // 保存文字并删除旧数据
  const handleSave = async () => {
    if (!input.trim()) return;
    setLoading(true);
    // 插入新数据
    const { data: insertData, error: insertError } = await supabase
      .from('texts')
      .insert([{ content: input }])
      .select();
    if (insertError) {
      alert('保存失败');
      setLoading(false);
      return;
    }
    // 删除非最新数据
    const { data: allData } = await supabase
      .from('texts')
      .select('id')
      .order('created_at', { ascending: false });
    if (allData && allData.length > 1) {
      const idsToDelete = allData.slice(1).map(row => row.id);
      await supabase.from('texts').delete().in('id', idsToDelete);
    }
    setInput('');
    await fetchLatestText();
    setLoading(false);
  };

  // 排行榜相关
  // 拉取排行榜前十名
  const fetchLeaderboard = async () => {
    const { data } = await supabase
      .from('snake_leaderboard')
      .select('*')
      .order('length', { ascending: false })
      .limit(10); // 只取前十名
    setLeaderboard(data || []);
  };

  // 历史排行榜
  const fetchHistoryBoard = async () => {
    const { data } = await supabase
      .from('snake_leaderboard')
      .select('*')
      .order('length', { ascending: false })
      .limit(10);
    setHistoryBoard(data || []);
  };

  // 实时排行榜
  const fetchRealtimeBoard = async () => {
    const { data } = await supabase
      .from('snake_realtime')
      .select('*')
      .order('length', { ascending: false })
      .limit(10);
    setRealtimeBoard((data || []).filter(item => item.length > 0));
  };

  // 上传长度到 Supabase
  const uploadLengthToSupabase = async (username, length) => {
    if (!username) return;
    // 查找是否有该用户名
    const { data: existArr } = await supabase
      .from('snake_leaderboard')
      .select('*')
      .eq('content', username);
    if (existArr && existArr.length > 0) {
      const existing = existArr[0];
      if (length > existing.length) {
        await supabase
          .from('snake_leaderboard')
          .update({ length })
          .eq('content', username);
      }
    } else {
      await supabase
        .from('snake_leaderboard')
        .insert([{ content: username, length }]);
    }
    fetchLeaderboard();
  };

  // 历史表：只在分数创新高时才更新，死亡时不清空
  const updateHistoryBoard = async (username, length) => {
    if (!username) return;
    const { data: existArr } = await supabase
      .from('snake_leaderboard')
      .select('*')
      .eq('content', username);
    if (existArr && existArr.length > 0) {
      const existing = existArr[0];
      if (length > existing.length) {
        await supabase
          .from('snake_leaderboard')
          .update({ length })
          .eq('content', username);
      }
    } else {
      await supabase
        .from('snake_leaderboard')
        .insert([{ content: username, length }]);
    }
  };

  // 实时表：每次都更新，死亡时 length=0
  const updateRealtimeBoard = async (username, length) => {
    const { data: existArr } = await supabase
      .from('snake_realtime')
      .select('*')
      .eq('content', username);
    if (existArr && existArr.length > 0) {
      await supabase
        .from('snake_realtime')
        .update({ length })
        .eq('content', username);
    } else {
      await supabase
        .from('snake_realtime')
        .insert([{ content: username, length }]);
    }
  };

  // 贪吃蛇游戏逻辑
  // 生成新食物
  const placeFood = (snakeArr) => {
    let x, y;
    do {
      x = Math.floor(Math.random() * cols);
      y = Math.floor(Math.random() * rows);
    } while (snakeArr.some(p => p.x === x && p.y === y));
    return { x, y };
  };

  // 移动蛇
  const move = () => {
    if (paused || gameOverFlag) return;
    const opposites = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    };
    let newDirection = direction;
    if (pendingDirection !== opposites[direction]) {
      newDirection = pendingDirection;
      setDirection(newDirection);
    }
    const head = { ...snake[0] };
    switch (newDirection) {
      case 'up': head.y--; break;
      case 'down': head.y++; break;
      case 'left': head.x--; break;
      case 'right': head.x++; break;
      default: break;
    }
    // 撞墙
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
      setGameOverFlag(true);
      setPaused(true);
      setTimeout(() => {
        setUsernameInput(text);
        setShowDeathModal(true);
      }, 100);
      updateRealtimeBoard(text, 0).then(fetchRealtimeBoard); // 死亡时上传0并刷新实时榜
      updateHistoryBoard(text, snake.length).then(fetchHistoryBoard);
      setSnake([{ x: 10, y: 10 }]);
      setDirection('right');
      setPendingDirection('right');
      setFood({ x: 5, y: 5 });
      setSnakeLength(1);
      setTimeout(() => setGameOverFlag(false), 500);
      return;
    }
    // 撞自己
    if (snake.some(p => p.x === head.x && p.y === head.y)) {
      setGameOverFlag(true);
      setPaused(true);
      setTimeout(() => {
        setUsernameInput(text);
        setShowDeathModal(true);
      }, 100);
      updateRealtimeBoard(text, 0).then(fetchRealtimeBoard);
      updateHistoryBoard(text, snake.length).then(fetchHistoryBoard);
      setSnake([{ x: 10, y: 10 }]);
      setDirection('right');
      setPendingDirection('right');
      setFood({ x: 5, y: 5 });
      setSnakeLength(1);
      setTimeout(() => setGameOverFlag(false), 500);
      return;
    }
    let newSnake = [head, ...snake];
    // 吃到食物
    if (head.x === food.x && head.y === food.y) {
      setFood(placeFood(newSnake));
      setSnakeLength(newSnake.length);
      updateRealtimeBoard(text, newSnake.length).then(fetchRealtimeBoard);
      updateHistoryBoard(text, newSnake.length).then(fetchHistoryBoard);
    } else {
      newSnake.pop();
      setSnakeLength(newSnake.length);
      updateRealtimeBoard(text, newSnake.length).then(fetchRealtimeBoard);
      updateHistoryBoard(text, newSnake.length).then(fetchHistoryBoard);
    }
    setSnake(newSnake);
  };

  // 定时器控制
  useEffect(() => {
    if (paused || gameOverFlag) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(move, intervalMs);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line
  }, [snake, direction, pendingDirection, paused, gameOverFlag, text]);

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        setPaused(p => !p);
        return;
      }
      if (paused) return;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          setPendingDirection('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          setPendingDirection('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          setPendingDirection('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          setPendingDirection('right');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line
  }, [paused]);

  // 新增处理用户名修改的函数
  const handleDeathModalConfirm = () => {
    const newName = usernameInput.trim();
    if (newName && newName !== text) {
      localStorage.setItem('snake_username', newName);
      setText(newName);
    }
    setShowDeathModal(false);
  };

  // 渲染格子
  const renderGrid = () => {
    const grid = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let className = 'cell';
        let content = '';
        const isFood = food.x === c && food.y === r;
        const snakeIdx = snake.findIndex(p => p.x === c && p.y === r);
        if (isFood) {
          className += ' food';
          content = (
            <div className="food-apple">
              <div className="food-highlight"></div>
              <div className="food-leaf"></div>
            </div>
          );
        }
        if (snakeIdx !== -1) {
          className += ' snake';
          if (snakeIdx === 0) {
            className += ' snake-head';
            content = (
              <>
                <div className="snake-eye left"></div>
                <div className="snake-eye right"></div>
              </>
            );
          } else if (snakeIdx === snake.length - 1) {
            className += ' snake-tail';
          }
        }
        grid.push(
          <div key={r + '-' + c} className={className} style={{ position: 'relative' }}>
            {content}
          </div>
        );
      }
    }
    return grid;
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      {/* 只保留游戏和排行榜区 */}
      <div className="game-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="side-board">
            <b>历史排行榜</b>
            <hr style={{ margin: '4px 0' }} />
            {historyBoard.map((item, i) => (
              <div key={item.content}>{i + 1}. {item.content}：{item.length}</div>
            ))}
          </div>
          {/* 用户名和操作提示，紧贴在历史排行榜下方 */}
          <div style={{
            marginTop: 8,
            color: '#888',
            fontSize: 16,
            whiteSpace: 'pre-line',
            textAlign: 'left',
            width: 120
          }}>
            {`用户名：${text}\n空格/ESC暂停\n方向键或WSAD控制`}
          </div>
        </div>
        <div id="game" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 24px)`, gridTemplateRows: `repeat(${rows}, 24px)`, gap: 4, justifyContent: 'center', margin: '32px auto 24px auto', background: '#e5e5ea', borderRadius: 32, boxShadow: '0 8px 32px 0 rgba(60, 60, 67, 0.12), 0 1.5px 4px 0 rgba(60, 60, 67, 0.08)', padding: 24, width: 'max-content' }}>
          {renderGrid()}
        </div>
        <div className="side-board">
          <b>实时排行榜</b>
          <hr style={{ margin: '4px 0' }} />
          {realtimeBoard.map((item, i) => (
            <div key={item.content}>{i + 1}. {item.content}：{item.length}</div>
          ))}
        </div>
      </div>
      {showDeathModal && (
        <div style={{
          position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320, textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 16 }}>游戏结束！</div>
            <div style={{ marginBottom: 12 }}>你可以修改用户名：</div>
            <input
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              style={{ fontSize: 16, padding: 8, width: '80%', marginBottom: 16 }}
              placeholder="输入新用户名"
            />
            <div>
              <button onClick={handleDeathModalConfirm} style={{ fontSize: 16, padding: '8px 24px' }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
